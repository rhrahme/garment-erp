import path from "path";
import {
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import {
  EMPTY_STITCH_KIOSK_SETTINGS,
  type StitchKioskPauseInterval,
  type StitchKioskSettingsFile,
} from "@/lib/types/stitch-kiosk-settings";

const STORE_PATH = path.join(process.cwd(), "src/data/stitch-kiosk-settings.json");

function normalizeIntervals(
  raw: StitchKioskSettingsFile | null | undefined
): StitchKioskPauseInterval[] {
  const listed = Array.isArray(raw?.pause_intervals) ? raw!.pause_intervals! : [];
  const cleaned = listed
    .filter((row) => row && typeof row.started_at === "string" && row.started_at.trim())
    .map((row) => ({
      started_at: row.started_at,
      ended_at: row.ended_at ?? null,
      paused_by: row.paused_by ?? null,
      resumed_by: row.resumed_by ?? null,
    }));

  // Heal: paused flag set but no open interval (ops / direct DB pause).
  if (raw?.paused && raw.paused_at) {
    const hasOpen = cleaned.some((row) => !row.ended_at);
    if (!hasOpen) {
      cleaned.push({
        started_at: raw.paused_at,
        ended_at: null,
        paused_by: raw.paused_by ?? null,
        resumed_by: null,
      });
    }
  }
  return cleaned;
}

function normalize(raw: StitchKioskSettingsFile | null | undefined): StitchKioskSettingsFile {
  return {
    ...EMPTY_STITCH_KIOSK_SETTINGS,
    ...(raw ?? {}),
    paused: Boolean(raw?.paused),
    paused_at: raw?.paused_at ?? null,
    paused_by: raw?.paused_by ?? null,
    resumed_at: raw?.resumed_at ?? null,
    resumed_by: raw?.resumed_by ?? null,
    updated_at: raw?.updated_at ?? null,
    pause_intervals: normalizeIntervals(raw),
  };
}

export async function readStitchKioskSettings(): Promise<StitchKioskSettingsFile> {
  return normalize(await readJsonFileAsync(STORE_PATH, EMPTY_STITCH_KIOSK_SETTINGS));
}

export async function readStitchKioskSettingsFresh(): Promise<StitchKioskSettingsFile> {
  return normalize(
    await readJsonFileFreshAsync(STORE_PATH, EMPTY_STITCH_KIOSK_SETTINGS, { force: true })
  );
}

export async function isStitchKioskPaused(): Promise<boolean> {
  const settings = await readStitchKioskSettingsFresh();
  return settings.paused;
}

export async function setStitchKioskPaused(
  paused: boolean,
  options: { actedBy?: string | null } = {}
): Promise<StitchKioskSettingsFile> {
  const current = await readStitchKioskSettingsFresh();
  const now = new Date().toISOString();
  const actedBy = options.actedBy?.trim() || null;
  const intervals = [...(current.pause_intervals ?? [])];

  if (paused) {
    if (!current.paused) {
      intervals.push({
        started_at: now,
        ended_at: null,
        paused_by: actedBy,
        resumed_by: null,
      });
    } else if (!intervals.some((row) => !row.ended_at)) {
      intervals.push({
        started_at: current.paused_at ?? now,
        ended_at: null,
        paused_by: actedBy ?? current.paused_by,
        resumed_by: null,
      });
    }
    const next: StitchKioskSettingsFile = {
      ...current,
      paused: true,
      paused_at: current.paused ? current.paused_at ?? now : now,
      paused_by: actedBy ?? current.paused_by,
      pause_intervals: intervals,
      updated_at: now,
    };
    await saveDocument(STORE_PATH, next);
    return next;
  }

  const openIndex = intervals.findIndex((row) => !row.ended_at);
  if (openIndex >= 0) {
    intervals[openIndex] = {
      ...intervals[openIndex]!,
      ended_at: now,
      resumed_by: actedBy,
    };
  }
  const next: StitchKioskSettingsFile = {
    ...current,
    paused: false,
    resumed_at: now,
    resumed_by: actedBy,
    pause_intervals: intervals,
    updated_at: now,
  };
  await saveDocument(STORE_PATH, next);
  return next;
}
