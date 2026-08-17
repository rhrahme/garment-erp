import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  extensionFromFilename,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { CLIENT_PHOTOS_BUCKET } from "@/lib/data/client-photo-storage";
import { CLIENT_SAMPLES_SUBDIR } from "@/lib/data/client-sample-storage";
import { ensureDocumentsLoaded, isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { canAccessClient } from "@/lib/sales/access";
import { findSampleAcrossClients } from "@/lib/clients/ready-made-samples";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Direct-to-storage uploads for ready-made sample images (Vercel caps request
 * bodies at ~4.5 MB, so phone photos go straight to the bucket). Same flow as
 * /api/sales/client-photos/upload-url; register via ./register.
 */
export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDocumentsLoaded(["clients"]);

  let body: {
    sample_id?: string;
    filename?: string;
    content_type?: string;
    size_bytes?: number;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sampleId = String(body.sample_id ?? "").trim();
  const found = findSampleAcrossClients(sampleId);
  if (!found || !canAccessClient(session, found.client)) {
    return NextResponse.json({ error: "Sample not found." }, { status: 404 });
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
  const imageId = `sample-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storedFilename = `${sampleId.replace(/[^a-z0-9-]/gi, "_")}-${imageId}.${extension}`;

  const { data, error } = await admin.storage
    .from(CLIENT_PHOTOS_BUCKET)
    .createSignedUploadUrl(`${CLIENT_SAMPLES_SUBDIR}/${storedFilename}`);
  if (error || !data) {
    console.error("Failed to create sample image upload URL:", error);
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
