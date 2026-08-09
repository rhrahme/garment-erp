import path from "path";
import {
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import {
  EMPTY_STITCH_KIOSK_SETTINGS,
  type StitchKioskSettingsFile,
} from "@/lib/types/stitch-kiosk-settings";

const STORE_PATH = path.join(process.cwd(), "src/data/stitch-kiosk-settings.json");

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
  const next: StitchKioskSettingsFile = paused
    ? {
        ...current,
        paused: true,
        paused_at: now,
        paused_by: actedBy,
        updated_at: now,
      }
    : {
        ...current,
        paused: false,
        resumed_at: now,
        resumed_by: actedBy,
        updated_at: now,
      };
  await saveDocument(STORE_PATH, next);
  return next;
}
