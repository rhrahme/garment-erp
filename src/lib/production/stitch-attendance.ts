import { STITCH_LUNCH_TIMEZONE } from "@/lib/production/stitch-kiosk-lunch";
import type { SewingKioskHereArm, SewingSessionsFile } from "@/lib/types/sewing-sessions";
import type {
  StitchAttendanceCheckIn,
  StitchAttendanceFile,
} from "@/lib/types/stitch-attendance";

/** Official wall placard. Distinct from EMP* badges and FR-* A4 pieces. */
export const ATTENDANCE_WALL_QR_PAYLOAD = "ATTEND";

/** Already-printed Sep 7 posters. Still accepted so hung sheets keep working. */
export const STITCH_HERE_QR_PAYLOAD = "HAGAN-HERE";

/** First Riyadh calendar day that counts as present. Print the QR the day before. */
export const ATTENDANCE_CLOCK_IN_GO_LIVE_RIYADH_DAY = "2026-09-08";

export function isHereWallQr(raw: string | null | undefined): boolean {
  const normalized = normalizeHereQr(raw);
  return (
    normalized === ATTENDANCE_WALL_QR_PAYLOAD || normalized === STITCH_HERE_QR_PAYLOAD
  );
}

export function normalizeHereQr(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function riyadhWorkdayKey(atMs: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STITCH_LUNCH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(atMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatRiyadhClock(atMs: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: STITCH_LUNCH_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(atMs));
}

export function isAttendanceClockInLive(atMs: number): boolean {
  return riyadhWorkdayKey(atMs) >= ATTENDANCE_CLOCK_IN_GO_LIVE_RIYADH_DAY;
}

export function checkInCountsForAttendance(
  row: Pick<StitchAttendanceCheckIn, "scanned_at">
): boolean {
  const stamped = Date.parse(row.scanned_at);
  return Number.isFinite(stamped) && isAttendanceClockInLive(stamped);
}

export const ATTENDANCE_BADGE_FIRST_MESSAGE =
  "Scan your ID badge first, then the wall QR.";

export const ATTENDANCE_BEFORE_GO_LIVE_MESSAGE =
  "Test scan received. Attendance is counted from tomorrow (8 Sep). This does not start a piece. Tomorrow the time you scan is the official clock-in.";

export function alreadySignedInMessage(employeeName: string): string {
  return `${employeeName} already signed in today.`;
}

export function hereClockInMessage(employeeName: string, atMs: number): string {
  return `${employeeName} signed in - ${formatRiyadhClock(atMs)}. Attendance only. Scan badge and A4 later to start a piece.`;
}

export function hereArmsOnKiosk(
  store: SewingSessionsFile,
  kioskId: string
): SewingKioskHereArm[] {
  return (store.kiosk_here_arms ?? []).filter((row) => row.kiosk_id === kioskId);
}

export function hereArmOnKiosk(
  store: SewingSessionsFile,
  kioskId: string
): SewingKioskHereArm | null {
  return hereArmsOnKiosk(store, kioskId)[0] ?? null;
}

export function applyHereArm(
  store: SewingSessionsFile,
  arm: SewingKioskHereArm
): SewingSessionsFile {
  return {
    ...store,
    kiosk_here_arms: [
      ...(store.kiosk_here_arms ?? []).filter((row) => row.kiosk_id !== arm.kiosk_id),
      arm,
    ],
  };
}

export function clearHereArm(store: SewingSessionsFile, kioskId: string): SewingSessionsFile {
  return {
    ...store,
    kiosk_here_arms: (store.kiosk_here_arms ?? []).filter((row) => row.kiosk_id !== kioskId),
  };
}

export function upsertHereCheckIn(
  store: StitchAttendanceFile,
  next: StitchAttendanceCheckIn
): { store: StitchAttendanceFile; created: boolean; check_in: StitchAttendanceCheckIn } {
  const checkIns = [...(store.check_ins ?? [])];
  const index = checkIns.findIndex(
    (row) =>
      row.workday === next.workday &&
      (row.employee_id === next.employee_id ||
        (next.employee_id_number &&
          row.employee_id_number === next.employee_id_number))
  );
  if (index >= 0) {
    const merged = {
      ...checkIns[index]!,
      ...next,
      scanned_at: checkIns[index]!.scanned_at,
    };
    checkIns[index] = merged;
    return { store: { ...store, check_ins: checkIns }, created: false, check_in: merged };
  }
  checkIns.push(next);
  return { store: { ...store, check_ins: checkIns }, created: true, check_in: next };
}

export function checkInTouchesPeriod(
  row: StitchAttendanceCheckIn,
  window: { from_ms: number; to_ms: number }
): boolean {
  const t = Date.parse(row.scanned_at);
  return Number.isFinite(t) && t >= window.from_ms && t <= window.to_ms;
}
