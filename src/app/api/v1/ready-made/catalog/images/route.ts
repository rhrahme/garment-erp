import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  clientMediaLimitError,
  clientMediaMaxBytes,
  extensionFromFilename,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { attachReadyMadeCatalogImage } from "@/lib/data/ready-made-catalog";
import { writeReadyMadeCatalogImage } from "@/lib/data/ready-made-catalog-storage";
import type { ReadyMadeCatalogImage } from "@/lib/types/ready-made-catalog";

/** Zapier parity: multipart image upload onto a garment or size. */
export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["ready_made_catalog"]);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const garmentId = String(form.get("garment_id") ?? "").trim();
  const size = String(form.get("size") ?? "").trim() || null;
  const file = form.get("file");
  if (!garmentId) {
    return NextResponse.json({ error: "garment_id is required." }, { status: 400 });
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
  const imageId = `rm-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storedFilename = `${garmentId.replace(/[^a-z0-9-]/gi, "_")}-${imageId}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeReadyMadeCatalogImage(storedFilename, buffer, contentType);

  const image: ReadyMadeCatalogImage = {
    id: imageId,
    filename: file.name || "upload",
    stored_filename: storedFilename,
    content_type: contentType,
    size_bytes: file.size,
    uploaded_at: new Date().toISOString(),
    uploaded_by: "api",
  };

  try {
    const garment = await attachReadyMadeCatalogImage({
      garment_id: garmentId,
      size,
      image,
      actor: "api",
    });
    return NextResponse.json({ image, garment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not attach image.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
