import type {
  ClientPattern,
  PatternLibraryAttachment,
} from "@/lib/types/pattern-library";

export interface TudVersionEntry {
  attachment: PatternLibraryAttachment;
  /** 1-based upload sequence (oldest = 1). */
  version: number;
  /** Trial version number when the file is attached to a trial; null = pattern-level. */
  trial_version: number | null;
  trial_version_id: string | null;
  is_active: boolean;
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

/** All .TUD uploads on a client pattern, oldest first; latest (or explicit active) is active. */
export function listClientPatternTudVersions(pattern: ClientPattern): TudVersionEntry[] {
  const collected = collectTudAttachments(pattern);
  if (collected.length === 0) return [];

  const explicitActive = pattern.active_tud_file_id?.trim() || null;
  const activeId =
    (explicitActive &&
      collected.find((entry) => entry.attachment.id === explicitActive)?.attachment.id) ||
    collected[collected.length - 1]!.attachment.id;

  return collected.map((entry, index) => ({
    attachment: entry.attachment,
    version: index + 1,
    trial_version: entry.trial_version,
    trial_version_id: entry.trial_version_id,
    is_active: entry.attachment.id === activeId,
  }));
}

export function findActiveTudAttachment(
  pattern: ClientPattern
): PatternLibraryAttachment | null {
  const versions = listClientPatternTudVersions(pattern);
  return versions.find((entry) => entry.is_active)?.attachment ?? null;
}
