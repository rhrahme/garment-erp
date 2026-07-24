import { notifyIntegration } from "@/lib/integrations";
import {
  PATTERN_LIBRARY_MAX_FILE_BYTES,
  classifyPatternLibraryFile,
  writePatternLibraryFile,
} from "@/lib/pattern-library/file-storage";
import { parseTudFile } from "@/lib/pattern-library/tud-parser";
import type { PatternLibraryAttachment } from "@/lib/types/pattern-library";

/** Stores the uploaded bytes and returns attachment metadata (caller persists it). */
export async function storeLibraryUpload(
  file: File,
  ownerPrefix: string,
  uploadedBy: string | null
): Promise<{ ok: true; attachment: PatternLibraryAttachment } | { ok: false; error: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) return { ok: false, error: "File is empty." };
  if (buffer.length > PATTERN_LIBRARY_MAX_FILE_BYTES) {
    return { ok: false, error: "File exceeds the 50MB limit." };
  }

  const { kind, contentType } = classifyPatternLibraryFile(file.name);
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedFilename = `${ownerPrefix}-${Date.now()}-${sanitized}`;
  await writePatternLibraryFile(storedFilename, buffer, contentType);

  const attachment: PatternLibraryAttachment = {
    id: `plf-${Date.now()}`,
    kind,
    filename: file.name,
    stored_filename: storedFilename,
    content_type: contentType,
    size_bytes: buffer.length,
    uploaded_at: new Date().toISOString(),
    uploaded_by: uploadedBy,
  };

  // .tud (TUKA CAD) files carry a plain-text header + embedded 100×100 JPEG
  // preview — extract both. Any failure falls back to a plain attachment.
  if (kind === "tud") {
    try {
      const parsed = parseTudFile(buffer);
      if (parsed) {
        attachment.tud = parsed.metadata;
        if (parsed.thumbnail) {
          const thumbnailName = `${storedFilename}.thumb.jpg`;
          await writePatternLibraryFile(thumbnailName, parsed.thumbnail, "image/jpeg");
          attachment.thumbnail_stored_filename = thumbnailName;
        }
      }
    } catch (error) {
      console.error("Failed to extract .tud metadata (stored as plain attachment):", error);
    }
  }

  return { ok: true, attachment };
}

/**
 * Resolves a `?file=` request against attachment metadata: direct file
 * downloads, plus extracted .tud thumbnails served as inline JPEGs.
 */
export function resolveLibraryFileRequest(
  files: PatternLibraryAttachment[],
  storedFilename: string
): { meta: PatternLibraryAttachment; isThumbnail: boolean } | null {
  const direct = files.find((file) => file.stored_filename === storedFilename);
  if (direct) return { meta: direct, isThumbnail: false };
  const thumbnailOwner = files.find(
    (file) => file.thumbnail_stored_filename === storedFilename
  );
  if (thumbnailOwner) return { meta: thumbnailOwner, isThumbnail: true };
  return null;
}

/** Parsed .tud summary fields merged into upload webhook payloads. */
export function tudNotificationFields(
  attachment: PatternLibraryAttachment
): Record<string, unknown> {
  if (!attachment.tud) return {};
  return {
    tud_style_caption: attachment.tud.style_caption,
    tud_sizes: attachment.tud.sizes,
    tud_piece_count: attachment.tud.pieces.length,
    tud_total_cut_pieces: attachment.tud.total_cut_pieces,
    tud_total_area_m2: attachment.tud.total_area_m2,
    tud_has_thumbnail: Boolean(attachment.thumbnail_stored_filename),
  };
}

export async function notifyLibraryFileUploaded(data: Record<string, unknown>): Promise<void> {
  await notifyIntegration("pattern_library.file_uploaded", data);
}
