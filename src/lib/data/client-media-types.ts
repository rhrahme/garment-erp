/** Phone-friendly image limit (HEIC/JPEG/PNG/WebP). */
export const CLIENT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
/** Phone video limit (MP4/MOV/WebM/3GP). Matches erp-client-photos bucket (50 MB). */
export const CLIENT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/3gpp",
  "video/3gpp2",
]);

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
  "3g2": "video/3gpp2",
};

export function isAllowedClientMediaType(contentType: string): boolean {
  const typed = contentType.toLowerCase().trim();
  return IMAGE_TYPES.has(typed) || VIDEO_TYPES.has(typed);
}

export function isClientVideoType(contentType: string): boolean {
  return VIDEO_TYPES.has(contentType.toLowerCase().trim());
}

export function isClientHeicType(contentType: string): boolean {
  const typed = contentType.toLowerCase().trim();
  return typed === "image/heic" || typed === "image/heif";
}

export function clientMediaMaxBytes(contentType: string): number {
  return isClientVideoType(contentType) ? CLIENT_VIDEO_MAX_BYTES : CLIENT_IMAGE_MAX_BYTES;
}

export function extensionFromFilename(filename: string): string {
  return filename.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() ?? "";
}

/** Normalize browser file.type (often empty on iOS) using the filename extension. */
export function resolveClientMediaContentType(
  file: Pick<File, "type" | "name">
): string | null {
  const typed = file.type.toLowerCase().trim();
  if (isAllowedClientMediaType(typed)) return typed;
  const fromName = EXTENSION_TYPES[extensionFromFilename(file.name)];
  return fromName && isAllowedClientMediaType(fromName) ? fromName : null;
}

export function clientMediaAcceptAttribute(): string {
  return [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/3gpp",
    "image/*",
    "video/*",
  ].join(",");
}

export function clientMediaLimitError(contentType: string | null): string {
  if (contentType && isClientVideoType(contentType)) {
    return "Use an MP4, MOV, WebM, or 3GP video under 50 MB.";
  }
  return "Use a JPG, PNG, WebP, HEIC, HEIF, or phone video under the size limit (15 MB images / 50 MB videos).";
}
