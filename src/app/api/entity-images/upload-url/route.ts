import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  extensionFromFilename,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { CLIENT_PHOTOS_BUCKET } from "@/lib/data/client-photo-storage";
import { ensureDocumentsLoaded, isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { ENTITY_IMAGES_SUBDIR } from "@/lib/data/entity-images-storage";
import { albumFilenamePrefix, resolveEntityKeyFromParts } from "@/lib/entity-images/keys";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDocumentsLoaded(["entity_images"]);

  let body: {
    key?: string;
    kind?: string;
    label?: string;
    supplier_id?: string;
    fabric_number?: string;
    garment_type?: string;
    sales_order_line_id?: string;
    filename?: string;
    content_type?: string;
    size_bytes?: number;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const ref = resolveEntityKeyFromParts(body);
  if (!ref) {
    return NextResponse.json({ error: "Album key is required." }, { status: 400 });
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
    return NextResponse.json({ mode: "direct", key: ref.key, label: body.label ?? ref.label });
  }

  const extension = extensionFromFilename(filename) || "jpg";
  const imageId = `ei-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storedFilename = `${albumFilenamePrefix(ref.key)}-${imageId}.${extension}`;

  const { data, error } = await admin.storage
    .from(CLIENT_PHOTOS_BUCKET)
    .createSignedUploadUrl(`${ENTITY_IMAGES_SUBDIR}/${storedFilename}`);
  if (error || !data) {
    console.error("Failed to create entity-image upload URL:", error);
    return NextResponse.json(
      { error: "Could not prepare the upload. Try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    mode: "signed",
    key: ref.key,
    label: body.label ?? ref.label,
    image_id: imageId,
    stored_filename: storedFilename,
    content_type: contentType,
    upload_url: data.signedUrl,
  });
}
