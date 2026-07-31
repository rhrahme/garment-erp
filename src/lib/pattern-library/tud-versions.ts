import type {
  ClientPattern,
  PatternLibraryAttachment,
} from "@/lib/types/pattern-library";

export interface TudVersionEntry {
  attachment: PatternLibraryAttachment;
  /** 1-based upload sequence (oldest = 1) within the scoped list. */
  version: number;
  /** Trial version number when the file is attached to a trial; null = pattern-level. */
  trial_version: number | null;
  trial_version_id: string | null;
  is_active: boolean;
  /** Garment piece this .TUD belongs to, when scoped. */
  piece_name: string | null;
}

function collectTudAttachments(pattern: ClientPattern): Array<{
  attachment: PatternLibraryAttachment;
  trial_version: number | null;
  trial_version_id: string | null;
}> {
  const entries: Array<{
    attachment: PatternLibraryAttachment;
    trial_version: number | null;
    trial_version_id: string | null;
  }> = [];
  for (const file of pattern.files) {
    if (file.kind === "tud") {
      entries.push({ attachment: file, trial_version: null, trial_version_id: null });
    }
  }
  for (const trial of pattern.versions) {
    for (const file of trial.files) {
      if (file.kind === "tud") {
        entries.push({
          attachment: file,
          trial_version: trial.version,
          trial_version_id: trial.id,
        });
      }
    }
  }
  entries.sort((a, b) => {
    const ta = new Date(a.attachment.uploaded_at).getTime();
    const tb = new Date(b.attachment.uploaded_at).getTime();
    if (ta !== tb) return ta - tb;
    return a.attachment.id.localeCompare(b.attachment.id);
  });
  return entries;
}

function resolveActiveId(
  collected: Array<{ attachment: PatternLibraryAttachment }>,
  explicitActive: string | null | undefined
): string | null {
  if (collected.length === 0) return null;
  const trimmed = explicitActive?.trim() || null;
  if (trimmed && collected.some((entry) => entry.attachment.id === trimmed)) {
    return trimmed;
  }
  return collected[collected.length - 1]!.attachment.id;
}

/** All .TUD uploads on a client pattern, oldest first; latest (or explicit active) is active. */
export function listClientPatternTudVersions(pattern: ClientPattern): TudVersionEntry[] {
  const collected = collectTudAttachments(pattern);
  if (collected.length === 0) return [];

  const activeId = resolveActiveId(collected, pattern.active_tud_file_id);

  return collected.map((entry, index) => ({
    attachment: entry.attachment,
    version: index + 1,
    trial_version: entry.trial_version,
    trial_version_id: entry.trial_version_id,
    is_active: entry.attachment.id === activeId,
    piece_name: entry.attachment.piece_name?.trim() || null,
  }));
}

export function findActiveTudAttachment(
  pattern: ClientPattern
): PatternLibraryAttachment | null {
  const versions = listClientPatternTudVersions(pattern);
  return versions.find((entry) => entry.is_active)?.attachment ?? null;
}

/**
 * .TUD history for one garment piece (Jacket, Trouser, ...).
 * Only attachments tagged with that piece_name are included.
 */
export function listClientPatternTudVersionsForPiece(
  pattern: ClientPattern,
  pieceName: string
): TudVersionEntry[] {
  const piece = pieceName.trim();
  if (!piece) return [];

  const collected = collectTudAttachments(pattern).filter(
    (entry) => (entry.attachment.piece_name ?? "").trim() === piece
  );
  if (collected.length === 0) return [];

  const activeId = resolveActiveId(collected, pattern.active_tud_by_piece?.[piece]);

  return collected.map((entry, index) => ({
    attachment: entry.attachment,
    version: index + 1,
    trial_version: entry.trial_version,
    trial_version_id: entry.trial_version_id,
    is_active: entry.attachment.id === activeId,
    piece_name: piece,
  }));
}

export function findActiveTudAttachmentForPiece(
  pattern: ClientPattern,
  pieceName: string
): PatternLibraryAttachment | null {
  const versions = listClientPatternTudVersionsForPiece(pattern, pieceName);
  return versions.find((entry) => entry.is_active)?.attachment ?? null;
}

/** Pattern-level .TUD files for a piece slot (or all .TUDs when pieceName is null). */
export function filterTudFilesForPiece(
  files: PatternLibraryAttachment[],
  pieceName: string | null
): PatternLibraryAttachment[] {
  const tuds = files.filter((file) => file.kind === "tud");
  if (!pieceName) return tuds;
  const piece = pieceName.trim();
  return tuds.filter((file) => (file.piece_name ?? "").trim() === piece);
}
