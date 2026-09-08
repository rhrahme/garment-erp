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

/** Wall-QR factory-entry time. Riyadh clock, ASCII. Today can omit the date. */
export function formatAttendanceCheckInLabel(
  iso: string | null | undefined,
  options?: { includeDate?: boolean }
): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const clock = formatRiyadhClock(at);
  if (options?.includeDate === false) return clock;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STITCH_LUNCH_TIMEZONE,
    day: "2-digit",
    month: "short",
  }).formatToParts(new Date(at));
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const monthRaw = parts.find((part) => part.type === "month")?.value ?? "";
  const month = monthRaw.slice(0, 3);
  return `${day} ${month} ${clock}`;
}

/** Morning door time: badge + wall QR, not a garment A4. */
export function formatMorningEntryLabel(
  iso: string | null | undefined,
  options?: { includeDate?: boolean }
): string | null {
  const clock = formatAttendanceCheckInLabel(iso, options);
  return clock ? `Entered ${clock}` : null;
}

/** End-of-day door time: same badge + wall QR, not a garment A4. */
export function formatMorningLeaveLabel(
  iso: string | null | undefined,
  options?: { includeDate?: boolean }
): string | null {
  const clock = formatAttendanceCheckInLabel(iso, options);
  return clock ? `Left ${clock}` : null;
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
  "Scan your ID badge, then the wall QR. Morning signs in. End of day signs out. Either order is accepted.";

export const ATTENDANCE_WALL_WAITING_MESSAGE =
  "Wall QR read. Scan your ID badge to sign in or out.";

/** Ignore a second door pair that is only a double-scan, not leaving. */
export const ATTENDANCE_CHECKOUT_MIN_MS = 2 * 60 * 1000;

export type AttendancePairEmployee = {
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
};

export type AttendancePairDecision =
  | { type: "wait_for_other"; next: "badge" | "wall" }
  | ({ type: "register" } & AttendancePairEmployee);

/** Wall QR: register if a badge is already armed; otherwise wait for the badge. */
export function decideAttendanceWallScan(
  armed: AttendancePairEmployee | null
): AttendancePairDecision {
  if (armed) {
    return { type: "register", ...armed };
  }
  return { type: "wait_for_other", next: "badge" };
}

/** Badge: register if the wall QR is already waiting; otherwise this is not attendance yet. */
export function decideAttendanceBadgeScan(
  pendingHere: boolean,
  employee: AttendancePairEmployee
): AttendancePairDecision {
  if (pendingHere) {
    return { type: "register", ...employee };
  }
  return { type: "wait_for_other", next: "wall" };
}

export const ATTENDANCE_BEFORE_GO_LIVE_MESSAGE =
  "Test scan received. Attendance is counted from tomorrow (8 Sep). This does not start a piece. Tomorrow the time you scan is the official clock-in.";

export function alreadySignedInMessage(employeeName: string): string {
  return `${employeeName} already signed in today.`;
}

export function alreadySignedOutMessage(employeeName: string): string {
  return `${employeeName} already signed out today.`;
}

export function hereClockInMessage(employeeName: string, atMs: number): string {
  return `${employeeName} signed in - ${formatRiyadhClock(atMs)}. Attendance only. Scan badge and A4 later to start a piece.`;
}

export function hereClockOutMessage(employeeName: string, atMs: number): string {
  return `${employeeName} signed out - ${formatRiyadhClock(atMs)}. Attendance only.`;
}

export type AttendanceDoorAction = "entered" | "left" | "already_entered" | "already_left";

export function attendanceDoorScanMessage(
  action: AttendanceDoorAction,
  employeeName: string,
  atMs: number
): string {
  if (action === "entered") return hereClockInMessage(employeeName, atMs);
  if (action === "left") return hereClockOutMessage(employeeName, atMs);
  if (action === "already_left") return alreadySignedOutMessage(employeeName);
  return alreadySignedInMessage(employeeName);
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

function sameWorkdayEmployee(
  row: StitchAttendanceCheckIn,
  next: Pick<StitchAttendanceCheckIn, "employee_id" | "employee_id_number" | "workday">
): boolean {
  return (
    row.workday === next.workday &&
    (row.employee_id === next.employee_id ||
      Boolean(next.employee_id_number && row.employee_id_number === next.employee_id_number))
  );
}

export function upsertHereCheckIn(
  store: StitchAttendanceFile,
  next: StitchAttendanceCheckIn
): { store: StitchAttendanceFile; created: boolean; check_in: StitchAttendanceCheckIn } {
  const checkIns = [...(store.check_ins ?? [])];
  const index = checkIns.findIndex((row) => sameWorkdayEmployee(row, next));
  if (index >= 0) {
    const merged = {
      ...checkIns[index]!,
      ...next,
      scanned_at: checkIns[index]!.scanned_at,
      checked_out_at: checkIns[index]!.checked_out_at ?? next.checked_out_at ?? null,
    };
    checkIns[index] = merged;
    return { store: { ...store, check_ins: checkIns }, created: false, check_in: merged };
  }
  checkIns.push(next);
  return { store: { ...store, check_ins: checkIns }, created: true, check_in: next };
}

/** First pair of the Riyadh day is enter. Later pair is leave. Same wall QR. */
export function applyAttendanceDoorScan(
  store: StitchAttendanceFile,
  next: StitchAttendanceCheckIn,
  atMs = Date.parse(next.scanned_at)
): {
  store: StitchAttendanceFile;
  created: boolean;
  action: AttendanceDoorAction;
  check_in: StitchAttendanceCheckIn;
} {
  const checkIns = [...(store.check_ins ?? [])];
  const index = checkIns.findIndex((row) => sameWorkdayEmployee(row, next));
  if (index < 0) {
    const saved = upsertHereCheckIn(store, { ...next, checked_out_at: null });
    return { ...saved, action: "entered" };
  }
  const existing = checkIns[index]!;
  if (existing.checked_out_at) {
    return { store, created: false, action: "already_left", check_in: existing };
  }
  const enteredAt = Date.parse(existing.scanned_at);
  if (
    !Number.isFinite(atMs) ||
    !Number.isFinite(enteredAt) ||
    atMs - enteredAt < ATTENDANCE_CHECKOUT_MIN_MS
  ) {
    return { store, created: false, action: "already_entered", check_in: existing };
  }
  const updated: StitchAttendanceCheckIn = {
    ...existing,
    employee_name: next.employee_name || existing.employee_name,
    employee_id_number: next.employee_id_number || existing.employee_id_number,
    kiosk_id: next.kiosk_id || existing.kiosk_id,
    checked_out_at: next.scanned_at,
  };
  checkIns[index] = updated;
  return {
    store: { ...store, check_ins: checkIns },
    created: false,
    action: "left",
    check_in: updated,
  };
}

export function checkInTouchesPeriod(
  row: StitchAttendanceCheckIn,
  window: { from_ms: number; to_ms: number }
): boolean {
  const t = Date.parse(row.scanned_at);
  return Number.isFinite(t) && t >= window.from_ms && t <= window.to_ms;
}
