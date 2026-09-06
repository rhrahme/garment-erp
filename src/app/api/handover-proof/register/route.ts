import { NextResponse } from "next/server";
import { requireAuthenticated, sessionActor } from "@/lib/auth/session";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { CLIENT_PHOTOS_BUCKET } from "@/lib/data/client-photo-storage";
import {
  HANDOVER_PROOF_SUBDIR,
  deleteHandoverProofImage,
} from "@/lib/data/handover-proof-storage";
import { isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { canAccessClient } from "@/lib/sales/access";
import {
  attachHandoverProof,
  canWriteWorkOrderHandoverProof,
  loadHandoverProofTarget,
} from "@/lib/production/handover-proof";
import { isHandoverProofTarget, type HandoverProofImage } from "@/lib/production/garment-handover";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Second step of the handover proof upload: verify the object and attach it. */
export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseDocumentsStorage()) {
    return NextResponse.json({ error: "Direct uploads are not enabled here." }, { status: 400 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Storage is not configured." }, { status: 500 });
  }

  let body: {
    target?: string;
    target_id?: string;
    image_id?: string;
    stored_filename?: string;
    filename?: string;
    content_type?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const targetRaw = String(body.target ?? "").trim();
  const targetId = String(body.target_id ?? "").trim();
  const imageId = String(body.image_id ?? "").trim();
  const storedFilename = String(body.stored_filename ?? "").trim();
  const displayFilename = String(body.filename ?? "").trim() || "upload";

  if (!isHandoverProofTarget(targetRaw)) {
    return NextResponse.json({ error: "Unknown handover proof target." }, { status: 400 });
  }

  const loaded = await loadHandoverProofTarget(targetRaw, targetId);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  if (loaded.kind === "sample" && !canAccessClient(session, loaded.client)) {
    return NextResponse.json({ error: "Sample not found." }, { status: 404 });
  }
  if (loaded.kind === "work_order" && !canWriteWorkOrderHandoverProof(session)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const expectedPrefix = `${targetRaw}-${targetId.replace(/[^a-z0-9-]/gi, "_")}-handover-proof-`;
  if (
    !imageId.startsWith("handover-proof-") ||
    !storedFilename.startsWith(expectedPrefix) ||
    !storedFilename.includes(imageId) ||
    !/^[a-z0-9_.-]+$/i.test(storedFilename)
  ) {
    return NextResponse.json({ error: "Invalid upload reference." }, { status: 400 });
  }

  const contentType = resolveClientMediaContentType({
    type: String(body.content_type ?? ""),
    name: storedFilename,
  });
  if (!contentType) {
    return NextResponse.json({ error: clientMediaLimitError(null) }, { status: 400 });
  }

  const { data: objects, error: listError } = await admin.storage
    .from(CLIENT_PHOTOS_BUCKET)
    .list(HANDOVER_PROOF_SUBDIR, { search: storedFilename, limit: 5 });
  const object = objects?.find((item) => item.name === storedFilename);
  if (listError || !object) {
    return NextResponse.json(
      { error: "Upload not found in storage. Retry the upload." },
      { status: 404 }
    );
  }
  const sizeBytes = Number(object.metadata?.size ?? 0);
  if (sizeBytes > clientMediaMaxBytes(contentType)) {
    try {
      await deleteHandoverProofImage(storedFilename);
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ error: clientMediaLimitError(contentType) }, { status: 400 });
  }

  const image: HandoverProofImage = {
    id: imageId,
    filename: displayFilename,
    stored_filename: storedFilename,
    content_type: contentType,
    size_bytes: sizeBytes,
    uploaded_at: new Date().toISOString(),
    uploaded_by: sessionActor(session),
  };
  const attached = await attachHandoverProof(targetRaw, targetId, image);
  if (!attached.ok) {
    return NextResponse.json({ error: attached.error }, { status: attached.status });
  }
  return NextResponse.json({ image }, { status: 201 });
}
