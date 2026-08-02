import {
  CLIENT_IMAGE_MAX_BYTES,
  isClientVideoType,
  prepareClientMediaForStorage,
  resolveClientMediaContentType,
} from "@/lib/data/client-media";
import { writeCustomFabricSwatch } from "@/lib/data/custom-fabric-swatch-storage";
import type { CustomFabricImage } from "@/lib/types/custom-fabrics";

export const CUSTOM_FABRIC_IMAGE_ERROR =
  "Use a JPG, PNG, WebP, or HEIC image under 15 MB.";

function makeImageId(): string {
  return `cf-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Persist an uploaded File as a custom-fabric swatch and return metadata. */
export async function storeCustomFabricImageFile(
  file: File,
  uploadedBy: string | null
): Promise<CustomFabricImage> {
  const contentType = resolveClientMediaContentType(file);
  if (!contentType || isClientVideoType(contentType)) {
    throw new Error(CUSTOM_FABRIC_IMAGE_ERROR);
  }
  if (file.size > CLIENT_IMAGE_MAX_BYTES) {
    throw new Error(CUSTOM_FABRIC_IMAGE_ERROR);
  }

  let prepared;
  try {
    prepared = await prepareClientMediaForStorage(file, contentType);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Failed to process image.";
    throw new Error(`Could not process this image (${message}). Try exporting as JPG.`);
  }

  const id = makeImageId();
  const storedFilename = `${id}.${prepared.extension}`;
  await writeCustomFabricSwatch(storedFilename, prepared.buffer, prepared.contentType);

  return {
    id,
    filename: prepared.displayFilename,
    stored_filename: storedFilename,
    content_type: prepared.contentType,
    size_bytes: prepared.sizeBytes,
    uploaded_at: new Date().toISOString(),
    uploaded_by: uploadedBy,
  };
}

/**
 * Download a remote image URL (Zapier/API) and store it like an upload.
 * Only http(s) URLs are accepted.
 */
export async function storeCustomFabricImageFromUrl(
  imageUrl: string,
  uploadedBy: string | null
): Promise<CustomFabricImage> {
  const trimmed = imageUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("image_url must be a valid http(s) URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("image_url must be a valid http(s) URL.");
  }

  const response = await fetch(parsed.toString(), { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to download image_url (${response.status}).`);
  }

  const contentTypeHeader = response.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(CUSTOM_FABRIC_IMAGE_ERROR);
  }
  if (buffer.length > CLIENT_IMAGE_MAX_BYTES) {
    throw new Error(CUSTOM_FABRIC_IMAGE_ERROR);
  }

  const pathname = parsed.pathname.split("/").pop() || "swatch.jpg";
  const mime = contentTypeHeader.split(";")[0]?.trim() || "image/jpeg";
  const file = new File([new Uint8Array(buffer)], pathname, { type: mime });
  return storeCustomFabricImageFile(file, uploadedBy);
}

export function pickPhotoFromFormData(form: FormData): File | null {
  for (const key of ["photo", "image", "swatch"]) {
    const value = form.get(key);
    if (value instanceof File && value.size > 0) return value;
  }
  return null;
}
