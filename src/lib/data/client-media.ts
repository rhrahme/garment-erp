import convert from "heic-convert";
import {
  extensionFromFilename,
  isClientHeicType,
  isClientVideoType,
} from "@/lib/data/client-media-types";

export {
  CLIENT_IMAGE_MAX_BYTES,
  CLIENT_VIDEO_MAX_BYTES,
  clientMediaAcceptAttribute,
  clientMediaLimitError,
  clientMediaMaxBytes,
  extensionFromFilename,
  isAllowedClientMediaType,
  isClientHeicType,
  isClientVideoType,
  resolveClientMediaContentType,
} from "@/lib/data/client-media-types";

export function isHeicBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  // ISO BMFF: size(4) + 'ftyp'(4) + brand(4)
  const brand = buffer.subarray(8, 12).toString("ascii");
  return brand === "heic" || brand === "heif" || brand === "mif1" || brand === "msf1";
}

export function looksLikeHeicMedia(input: {
  contentType?: string | null;
  filename?: string | null;
  storedFilename?: string | null;
  buffer?: Buffer | null;
}): boolean {
  if (input.contentType && isClientHeicType(input.contentType)) return true;
  const names = [input.filename, input.storedFilename].filter(Boolean) as string[];
  if (names.some((name) => /\.hei[cf]$/i.test(name))) return true;
  if (input.buffer && isHeicBuffer(input.buffer)) return true;
  return false;
}

export type PreparedClientMedia = {
  buffer: Buffer;
  contentType: string;
  extension: string;
  /** Display name keeps the original upload name (e.g. IMG_9662.HEIC). */
  displayFilename: string;
  sizeBytes: number;
};

/**
 * Normalize phone media for browser display:
 * HEIC/HEIF ? JPEG; other images/videos pass through unchanged.
 */
export async function prepareClientMediaForStorage(
  file: File,
  contentType: string
): Promise<PreparedClientMedia> {
  const original = Buffer.from(await file.arrayBuffer());
  const displayFilename = file.name || "upload";

  if (isClientHeicType(contentType) || isHeicBuffer(original)) {
    const jpeg = Buffer.from(
      await convert({
        buffer: original,
        format: "JPEG",
        quality: 0.9,
      })
    );
    return {
      buffer: jpeg,
      contentType: "image/jpeg",
      extension: "jpg",
      displayFilename,
      sizeBytes: jpeg.length,
    };
  }

  const extension =
    extensionFromFilename(displayFilename) ||
    (isClientVideoType(contentType)
      ? contentType === "video/quicktime"
        ? "mov"
        : contentType === "video/webm"
          ? "webm"
          : contentType.startsWith("video/3gpp")
            ? "3gp"
            : "mp4"
      : contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : "jpg");

  return {
    buffer: original,
    contentType,
    extension,
    displayFilename,
    sizeBytes: original.length,
  };
}

/** Convert stored HEIC/HEIF bytes to JPEG for <img> responses. */
export async function convertHeicBufferToJpeg(buffer: Buffer): Promise<Buffer> {
  return Buffer.from(
    await convert({
      buffer,
      format: "JPEG",
      quality: 0.9,
    })
  );
}
