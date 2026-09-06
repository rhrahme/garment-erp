import {
  currentStitchWorkdayStartMs,
  riyadhDateTimeLocalToUtcMs,
} from "@/lib/production/stitch-kiosk-lunch";

export function validateManualStartAt(
  startedAt: string,
  nowMs: number = Date.now()
): { ok: true; atMs: number } | { ok: false; error: string } {
  const fromLocal = riyadhDateTimeLocalToUtcMs(startedAt);
  const fromIso = Date.parse(startedAt);
  const atMs = fromLocal ?? (Number.isFinite(fromIso) ? fromIso : NaN);
  if (!Number.isFinite(atMs)) {
    return { ok: false, error: "Enter a valid start time." };
  }
  if (atMs > nowMs + 2 * 60_000) {
    return { ok: false, error: "Start time cannot be in the future." };
  }
  const workdayStart = currentStitchWorkdayStartMs(nowMs);
  if (atMs < workdayStart) {
    return { ok: false, error: "Start time must be during today's workday (from 08:00 Riyadh)." };
  }
  return { ok: true, atMs };
}

export function validateCorrectedStartAt(input: {
  startedAt: string;
  currentStartedAt: string;
  endedAt?: string | null;
  nowMs?: number;
}): { ok: true; iso: string } | { ok: false; error: string } {
  const nowMs = input.nowMs ?? Date.now();
  const check = validateManualStartAt(input.startedAt, nowMs);
  if (!check.ok) return check;
  const currentMs = Date.parse(input.currentStartedAt);
  if (Number.isFinite(currentMs) && check.atMs === currentMs) {
    return { ok: false, error: "Enter a different start time than the scan time." };
  }
  if (input.endedAt) {
    const endedMs = Date.parse(input.endedAt);
    if (Number.isFinite(endedMs) && check.atMs > endedMs) {
      return { ok: false, error: "Start time cannot be after the session end." };
    }
  }
  return { ok: true, iso: new Date(check.atMs).toISOString() };
}
