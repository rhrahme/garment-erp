import { findActiveTudAttachment } from "@/lib/pattern-library/tud-versions";
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
  /** Download URL for the original .tud file. */
  downloadUrl: string;
}

function fileUrl(downloadUrlBase: string, storedFilename: string): string {
  const joiner = downloadUrlBase.includes("?") ? "&" : "?";
  return `${downloadUrlBase}${joiner}file=${encodeURIComponent(storedFilename)}`;
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
  const urlBase = `/api/pattern/library/bases/${base.id}/files`;
  return {
    attachment,
    thumbnailUrl: fileUrl(urlBase, attachment.thumbnail_stored_filename),
    downloadUrl: fileUrl(urlBase, attachment.stored_filename),
  };
}

/** Active .TUD preview (explicit active id, else latest upload with thumbnail). */
export function clientPatternTudPreview(pattern: ClientPattern): TudPreview | null {
  const active = findActiveTudAttachment(pattern);
  const attachment =
    active?.thumbnail_stored_filename
      ? active
      : [...pattern.versions]
          .reverse()
          .map((version) => findLatestTudThumbnail(version.files))
          .concat(findLatestTudThumbnail(pattern.files))
          .find((candidate) => candidate !== null) ?? null;
  if (!attachment?.thumbnail_stored_filename) return null;
  const urlBase = `/api/pattern/library/client-patterns/${pattern.id}/files`;
  return {
    attachment,
    thumbnailUrl: fileUrl(urlBase, attachment.thumbnail_stored_filename),
    downloadUrl: fileUrl(urlBase, attachment.stored_filename),
  };
}

/** Human label for TUKA fabric codes seen in -M/-X records. */
const FABRIC_LABELS: Record<string, string> = {
  SHEEL: "Shell",
  FINISH: "Fusing",
  CONTASH: "Contrast",
};

export function tudFabricLabel(fabric: string | null): string {
  if (!fabric) return "-";
  return FABRIC_LABELS[fabric.toUpperCase()] ?? fabric;
}

export function formatAreaM2(value: number | null): string {
  if (value === null) return "-";
  return `${value.toFixed(2)} m²`;
}

export function formatPieceAreaM2(value: number | null): string {
  if (value === null) return "-";
  return `${value.toFixed(3)} m²`;
}
