import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { CLIENT_PHOTOS_BUCKET } from "@/lib/data/client-photo-storage";
import { ensureDocumentsLoaded, isSupabaseDocumentsStorage } from "@/lib/data/document-persistence";
import { attachEntityImage } from "@/lib/data/entity-images";
import {
  deleteEntityImageFile,
  ENTITY_IMAGES_SUBDIR,
} from "@/lib/data/entity-images-storage";
import { albumFilenamePrefix, resolveEntityKeyFromParts } from "@/lib/entity-images/keys";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { EntityImage } from "@/lib/types/entity-images";

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
  await ensureDocumentsLoaded(["entity_images"]);

  let body: {
    key?: string;
    kind?: string;
    label?: string;
    supplier_id?: string;
    fabric_number?: string;
    garment_type?: string;
    sales_order_line_id?: string;
    inventory_item_id?: string;
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

  const ref = resolveEntityKeyFromParts(body);
  const imageId = String(body.image_id ?? "").trim();
  const storedFilename = String(body.stored_filename ?? "").trim();
  const displayFilename = String(body.filename ?? "").trim() || "upload";
  const prefix = `${albumFilenamePrefix(ref?.key ?? "")}-ei-image-`;
  if (
    !ref ||
    !imageId.startsWith("ei-image-") ||
    !storedFilename.startsWith(prefix) ||
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
    .list(ENTITY_IMAGES_SUBDIR, { search: storedFilename, limit: 5 });
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
      await deleteEntityImageFile(storedFilename);
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ error: clientMediaLimitError(contentType) }, { status: 400 });
  }

  const image: EntityImage = {
    id: imageId,
    filename: displayFilename,
    stored_filename: storedFilename,
    content_type: contentType,
    size_bytes: sizeBytes,
    uploaded_at: new Date().toISOString(),
    uploaded_by: session.email,
  };

  try {
    const album = await attachEntityImage({
      key: ref.key,
      label: body.label ?? ref.label,
      image,
      actor: session.email,
    });
    return NextResponse.json({ image, album }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not attach image.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
