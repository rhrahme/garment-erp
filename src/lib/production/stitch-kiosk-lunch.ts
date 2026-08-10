/**
 * Factory lunch: Asia/Riyadh. Scans pause for lunch; auto-resume at 16:00
 * so the floor can scan again (kiosk gate only — not per article).
 */

export const STITCH_LUNCH_TIMEZONE = "Asia/Riyadh";
/** Local hour when lunch pause may begin (admin or future auto-pause). */
export const STITCH_LUNCH_PAUSE_HOUR = 14;
/** Local time when the kiosk gate auto-opens again. */
export const STITCH_LUNCH_RESUME_HOUR = 16;
export const STITCH_LUNCH_RESUME_MINUTE = 0;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function zonedParts(ms: number, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Instant for Y-M-D H:M in Asia/Riyadh (no DST). */
export function riyadhWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): number {
  const utcGuess = Date.UTC(year, month - 1, day, hour - 3, minute, 0, 0);
  const parts = zonedParts(utcGuess, STITCH_LUNCH_TIMEZONE);
  const asMinutes = parts.hour * 60 + parts.minute;
  const wantMinutes = hour * 60 + minute;
  return utcGuess + (wantMinutes - asMinutes) * 60_000;
}

export function stitchLunchResumeAtMs(nowMs: number = Date.now()): number {
  const p = zonedParts(nowMs, STITCH_LUNCH_TIMEZONE);
  return riyadhWallTimeToUtcMs(
    p.year,
    p.month,
    p.day,
    STITCH_LUNCH_RESUME_HOUR,
    STITCH_LUNCH_RESUME_MINUTE
  );
}

/** Pause started in today's lunch window [14:00, 16:00) Asia/Riyadh. */
export function isStitchLunchPauseWindow(
  pausedAtIso: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!pausedAtIso) return false;
  const pausedMs = Date.parse(pausedAtIso);
  if (!Number.isFinite(pausedMs)) return false;
  const now = zonedParts(nowMs, STITCH_LUNCH_TIMEZONE);
  const paused = zonedParts(pausedMs, STITCH_LUNCH_TIMEZONE);
  if (
    paused.year !== now.year ||
    paused.month !== now.month ||
    paused.day !== now.day
  ) {
    return false;
  }
  const mins = paused.hour * 60 + paused.minute;
  const start = STITCH_LUNCH_PAUSE_HOUR * 60;
  const end = STITCH_LUNCH_RESUME_HOUR * 60 + STITCH_LUNCH_RESUME_MINUTE;
  return mins >= start && mins < end;
}

/**
 * True when the kiosk is still paused for today's lunch and local time
 * is at/after 16:00 Riyadh — time to open the scan gate again.
 */
export function shouldAutoResumeStitchKioskLunch(input: {
  paused: boolean;
  paused_at: string | null | undefined;
  auto_resume_at?: string | null;
  nowMs?: number;
}): boolean {
  if (!input.paused) return false;
  const nowMs = input.nowMs ?? Date.now();

  if (input.auto_resume_at) {
    const at = Date.parse(input.auto_resume_at);
    return Number.isFinite(at) && nowMs >= at;
  }

  // Heal older pauses without auto_resume_at (lunch window only).
  if (!isStitchLunchPauseWindow(input.paused_at, nowMs)) return false;
  return nowMs >= stitchLunchResumeAtMs(nowMs);
}

/** When starting a pause, set auto_resume_at for lunch-window pauses. */
export function stitchLunchAutoResumeAtIsoForPause(
  nowMs: number = Date.now()
): string | null {
  const p = zonedParts(nowMs, STITCH_LUNCH_TIMEZONE);
  const mins = p.hour * 60 + p.minute;
  const start = STITCH_LUNCH_PAUSE_HOUR * 60;
  const end = STITCH_LUNCH_RESUME_HOUR * 60 + STITCH_LUNCH_RESUME_MINUTE;
  if (mins < start || mins >= end) return null;
  return new Date(stitchLunchResumeAtMs(nowMs)).toISOString();
}
