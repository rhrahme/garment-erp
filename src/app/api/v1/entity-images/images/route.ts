import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  extensionFromFilename,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { attachEntityImage } from "@/lib/data/entity-images";
import { writeEntityImage } from "@/lib/data/entity-images-storage";
import { albumFilenamePrefix, resolveEntityKeyFromParts } from "@/lib/entity-images/keys";
import type { EntityImage } from "@/lib/types/entity-images";

/** Zapier parity: multipart image upload onto a fabric, garment, or article. */
export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["entity_images"]);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const ref = resolveEntityKeyFromParts({
    key: String(form.get("key") ?? ""),
    kind: String(form.get("kind") ?? ""),
    supplier_id: String(form.get("supplier_id") ?? ""),
    fabric_number: String(form.get("fabric_number") ?? ""),
    garment_type: String(form.get("garment_type") ?? ""),
    sales_order_line_id: String(form.get("sales_order_line_id") ?? ""),
    inventory_item_id: String(form.get("inventory_item_id") ?? ""),
  });
  const file = form.get("file");
  if (!ref) {
    return NextResponse.json({ error: "Album key is required." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  const contentType = resolveClientMediaContentType(file);
  if (!contentType) {
    return NextResponse.json({ error: clientMediaLimitError(null) }, { status: 400 });
  }
  if (file.size > clientMediaMaxBytes(contentType)) {
    return NextResponse.json({ error: clientMediaLimitError(contentType) }, { status: 400 });
  }

  const extension = extensionFromFilename(file.name) || "jpg";
  const imageId = `ei-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storedFilename = `${albumFilenamePrefix(ref.key)}-${imageId}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeEntityImage(storedFilename, buffer, contentType);

  const image: EntityImage = {
    id: imageId,
    filename: file.name || "upload",
    stored_filename: storedFilename,
    content_type: contentType,
    size_bytes: file.size,
    uploaded_at: new Date().toISOString(),
    uploaded_by: "api",
  };

  try {
    const album = await attachEntityImage({
      key: ref.key,
      label: String(form.get("label") ?? "") || ref.label,
      image,
      actor: "api",
    });
    return NextResponse.json({ image, album }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not attach image.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
