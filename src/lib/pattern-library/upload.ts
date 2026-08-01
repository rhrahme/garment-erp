import { notifyIntegration } from "@/lib/integrations";
import { parseDxfFile } from "@/lib/pattern-library/dxf-parser";
import {
  PATTERN_LIBRARY_MAX_FILE_BYTES,
  classifyPatternLibraryFile,
  writePatternLibraryFile,
} from "@/lib/pattern-library/file-storage";
import { parseRulFile } from "@/lib/pattern-library/rul-parser";
import { parseTumFile } from "@/lib/pattern-library/tum-parser";
import { parseTudFile } from "@/lib/pattern-library/tud-parser";
import type { PatternLibraryAttachment } from "@/lib/types/pattern-library";

/** Stores the uploaded bytes and returns attachment metadata (caller persists it). */
export async function storeLibraryUpload(
  file: File,
  ownerPrefix: string,
  uploadedBy: string | null,
  options: { forceKind?: PatternLibraryAttachment["kind"] | null } = {}
): Promise<{ ok: true; attachment: PatternLibraryAttachment } | { ok: false; error: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) return { ok: false, error: "File is empty." };
  if (buffer.length > PATTERN_LIBRARY_MAX_FILE_BYTES) {
    return { ok: false, error: "File exceeds the 50MB limit." };
  }

  const classified = classifyPatternLibraryFile(file.name);
  const kind = options.forceKind ?? classified.kind;
  const contentType =
    kind === "marker" && classified.kind !== "marker"
      ? "application/octet-stream"
      : classified.contentType;
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

  // .tum (TUKAmrk) — same header+JPEG shape; store -D metrics + piece list.
  // Binary marker geometry is not decoded.
  if (kind === "marker") {
    try {
      const parsed = parseTumFile(buffer);
      if (parsed) {
        attachment.tum = parsed.metadata;
        if (parsed.thumbnail) {
          const thumbnailName = `${storedFilename}.thumb.jpg`;
          await writePatternLibraryFile(thumbnailName, parsed.thumbnail, "image/jpeg");
          attachment.thumbnail_stored_filename = thumbnailName;
        }
      }
    } catch (error) {
      console.error("Failed to extract .tum metadata (stored as plain marker):", error);
    }
  }

  // .dxf — ASCII polylines → real piece outlines for nest preview.
  if (kind === "dxf") {
    try {
      const parsed = parseDxfFile(buffer);
      if (parsed) {
        attachment.dxf = parsed.metadata;
      }
    } catch (error) {
      console.error("Failed to extract .dxf outlines (stored as plain attachment):", error);
    }
  }

  // .rul — grade-rule / size list only (no geometry).
  if (kind === "rul") {
    try {
      const parsed = parseRulFile(buffer);
      if (parsed) {
        attachment.rul = parsed;
      }
    } catch (error) {
      console.error("Failed to extract .rul metadata (stored as plain attachment):", error);
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

/** Parsed .tum (TUKAmrk) summary fields for marker upload webhooks. */
export function tumNotificationFields(
  attachment: PatternLibraryAttachment
): Record<string, unknown> {
  if (!attachment.tum) return {};
  return {
    tum_style_caption: attachment.tum.style_caption,
    tum_length_cm: attachment.tum.length_cm,
    tum_width_cm: attachment.tum.width_cm,
    tum_efficiency_pct: attachment.tum.efficiency_pct,
    tum_size: attachment.tum.size,
    tum_garment_qty: attachment.tum.garment_qty,
    tum_piece_count: attachment.tum.pieces.length,
    tum_total_cut_pieces: attachment.tum.total_cut_pieces,
    tum_has_thumbnail: Boolean(attachment.thumbnail_stored_filename),
  };
}

/** Parsed .dxf outline summary fields for upload webhooks. */
export function dxfNotificationFields(
  attachment: PatternLibraryAttachment
): Record<string, unknown> {
  if (!attachment.dxf) return {};
  return {
    dxf_style_caption: attachment.dxf.style_caption,
    dxf_sizes: attachment.dxf.sizes,
    dxf_piece_count: attachment.dxf.pieces.length,
    dxf_total_cut_pieces: attachment.dxf.total_cut_pieces,
    dxf_units: attachment.dxf.units,
    dxf_has_outlines: attachment.dxf.pieces.some((p) => p.outline_cm.length >= 3),
  };
}

/** Parsed .rul size-list fields for upload webhooks. */
export function rulNotificationFields(
  attachment: PatternLibraryAttachment
): Record<string, unknown> {
  if (!attachment.rul) return {};
  return {
    rul_grade_rule_table: attachment.rul.grade_rule_table,
    rul_sizes: attachment.rul.sizes,
    rul_sample_size: attachment.rul.sample_size,
    rul_units: attachment.rul.units,
  };
}

export async function notifyLibraryFileUploaded(data: Record<string, unknown>): Promise<void> {
  await notifyIntegration("pattern_library.file_uploaded", data);
  // .TUD re-uploads also emit client_pattern.tud_version_uploaded from
  // attachClientPatternFile (versioned history + active pointer).
}
