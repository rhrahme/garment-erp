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
import {
  findReadyMadeCatalogGarment,
  readReadyMadeCatalog,
} from "@/lib/data/ready-made-catalog";
import { READY_MADE_CATALOG_SUBDIR } from "@/lib/data/ready-made-catalog-storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureDocumentsLoaded(["ready_made_catalog"]);

  let body: {
    garment_id?: string;
    filename?: string;
    content_type?: string;
    size_bytes?: number;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const garmentId = String(body.garment_id ?? "").trim();
  const catalog = await readReadyMadeCatalog();
  if (!findReadyMadeCatalogGarment(catalog, garmentId)) {
    return NextResponse.json({ error: "Garment not found." }, { status: 404 });
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
  const imageId = `rm-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storedFilename = `${garmentId.replace(/[^a-z0-9-]/gi, "_")}-${imageId}.${extension}`;

  const { data, error } = await admin.storage
    .from(CLIENT_PHOTOS_BUCKET)
    .createSignedUploadUrl(`${READY_MADE_CATALOG_SUBDIR}/${storedFilename}`);
  if (error || !data) {
    console.error("Failed to create ready-made catalog upload URL:", error);
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
