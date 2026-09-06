import { STITCH_LUNCH_TIMEZONE } from "@/lib/production/stitch-kiosk-lunch";
import type { SewingKioskHereArm, SewingSessionsFile } from "@/lib/types/sewing-sessions";
import type {
  StitchAttendanceCheckIn,
  StitchAttendanceFile,
} from "@/lib/types/stitch-attendance";

/** Printed on every wall poster. Distinct from EMP* badges and FR-* A4 pieces. */
export const STITCH_HERE_QR_PAYLOAD = "HAGAN-HERE";

export function isHereWallQr(raw: string | null | undefined): boolean {
  return normalizeHereQr(raw) === STITCH_HERE_QR_PAYLOAD;
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

export function hereClockInMessage(employeeName: string, atMs: number): string {
  return `${employeeName} here - ${formatRiyadhClock(atMs)}. Scan A4 when you start a piece.`;
}
