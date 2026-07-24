import type {
  BasePattern,
  ClientPattern,
  PatternLibraryAttachment,
} from "@/lib/types/pattern-library";

/**
 * Client-safe helpers for showing extracted .TUD previews (thumbnail + parsed
 * metadata) on cards and detail pages.
 */

export interface TudPreview {
  attachment: PatternLibraryAttachment;
  /** Inline JPEG URL for the extracted 100×100 preview. */
  thumbnailUrl: string;
}

function thumbnailUrl(downloadUrlBase: string, storedThumbnail: string): string {
  const joiner = downloadUrlBase.includes("?") ? "&" : "?";
  return `${downloadUrlBase}${joiner}file=${encodeURIComponent(storedThumbnail)}`;
}

/** Most recently uploaded .tud attachment that has an extracted thumbnail. */
export function findLatestTudThumbnail(
  files: PatternLibraryAttachment[]
): PatternLibraryAttachment | null {
  for (let i = files.length - 1; i >= 0; i--) {
    const file = files[i];
    if (file && file.kind === "tud" && file.thumbnail_stored_filename) return file;
  }
  return null;
}

export function basePatternTudPreview(base: BasePattern): TudPreview | null {
  const attachment = findLatestTudThumbnail(base.files);
  if (!attachment?.thumbnail_stored_filename) return null;
  return {
    attachment,
    thumbnailUrl: thumbnailUrl(
      `/api/pattern/library/bases/${base.id}/files`,
      attachment.thumbnail_stored_filename
    ),
  };
}

/** Latest version's .TUD preview, falling back to pattern-level files. */
export function clientPatternTudPreview(pattern: ClientPattern): TudPreview | null {
  const candidates = [...pattern.versions]
    .reverse()
    .map((version) => findLatestTudThumbnail(version.files))
    .concat(findLatestTudThumbnail(pattern.files));
  const attachment = candidates.find((candidate) => candidate !== null) ?? null;
  if (!attachment?.thumbnail_stored_filename) return null;
  return {
    attachment,
    thumbnailUrl: thumbnailUrl(
      `/api/pattern/library/client-patterns/${pattern.id}/files`,
      attachment.thumbnail_stored_filename
    ),
  };
}

export function formatAreaM2(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(2)} m²`;
}

export function formatPieceAreaM2(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(3)} m²`;
}
