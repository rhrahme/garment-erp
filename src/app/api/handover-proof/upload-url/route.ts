import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  extensionFromFilename,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { CLIENT_PHOTOS_BUCKET } from "@/lib/data/client-photo-storage";
import { HANDOVER_PROOF_SUBDIR } from "@/lib/data/handover-proof-storage";
import { isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { canAccessClient } from "@/lib/sales/access";
import {
  canWriteWorkOrderHandoverProof,
  loadHandoverProofTarget,
} from "@/lib/production/handover-proof";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Direct-to-storage uploads for handover proof photos (Vercel caps request
 * bodies at ~4.5 MB). Register via ./register.
 */
export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    target?: string;
    target_id?: string;
    filename?: string;
    content_type?: string;
    size_bytes?: number;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const loaded = await loadHandoverProofTarget(body.target ?? "", body.target_id ?? "");
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  if (loaded.kind === "sample" && !canAccessClient(session, loaded.client)) {
    return NextResponse.json({ error: "Sample not found." }, { status: 404 });
  }
  if (loaded.kind === "work_order" && !canWriteWorkOrderHandoverProof(session)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const filename = String(body.filename ?? "").trim() || "upload";
  const contentType = resolveClientMediaContentType({
    type: String(body.content_type ?? ""),
    name: filename,
  });
  if (!contentType) {
    return NextResponse.json({ error: clientMediaLimitError(null) }, { status: 400 });
  }
  const sizeBytes = Number(body.size_bytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json({ error: "size_bytes is required." }, { status: 400 });
  }
  if (sizeBytes > clientMediaMaxBytes(contentType)) {
    return NextResponse.json({ error: clientMediaLimitError(contentType) }, { status: 400 });
  }

  const admin = isSupabaseDocumentsStorage() ? getSupabaseAdmin() : null;
  if (!admin) {
    return NextResponse.json({ mode: "direct" });
  }

  const extension = extensionFromFilename(filename) || "jpg";
  const imageId = `handover-proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const targetId = String(body.target_id ?? "").trim();
  const storedFilename = `${loaded.kind}-${targetId.replace(/[^a-z0-9-]/gi, "_")}-${imageId}.${extension}`;

  const { data, error } = await admin.storage
    .from(CLIENT_PHOTOS_BUCKET)
    .createSignedUploadUrl(`${HANDOVER_PROOF_SUBDIR}/${storedFilename}`);
  if (error || !data) {
    console.error("Failed to create handover proof upload URL:", error);
    return NextResponse.json(
      { error: "Could not prepare the upload. Try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    mode: "signed",
    image_id: imageId,
    stored_filename: storedFilename,
    content_type: contentType,
    upload_url: data.signedUrl,
  });
}
