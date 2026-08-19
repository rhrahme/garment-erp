import { badgeDisplayName } from "@/lib/hr/badge-print";
import {
  isTailorJobFunction,
  normalizeJobFunctions,
} from "@/lib/hr/job-functions";
import { employeeCanSewOnStitchKiosk } from "@/lib/hr/payroll-utils";
import {
  parseSewingDashboardPeriod,
  sewingPeriodWindow,
  type SewingDashboardPeriod,
  type SewingEmployeeWorkPeriod,
  type SewingEmployeeWorkSummary,
  type SewingPeriodWindow,
} from "@/lib/production/sewing-session-state";
import { floorActivityLabelFromJobFunctions } from "@/lib/production/sewing-session-status-label";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";
import type { SewingSession, SewingSessionsFile } from "@/lib/types/sewing-sessions";

export type SewingFloorAttendanceRow = {
  employee_id: string;
  employee_name: string;
  employee_id_number: string;
  activity: string;
  workstation_id: string | null;
  scanned: boolean;
  live: boolean;
  count: number;
  duration_sec: number;
};

export type SewingFloorAttendance = {
  period: SewingDashboardPeriod;
  from_iso: string;
  to_iso: string;
  expected: number;
  scanned: number;
  missing: number;
  live: number;
  pieces: number;
  duration_sec: number;
  missing_rows: SewingFloorAttendanceRow[];
  scanned_rows: SewingFloorAttendanceRow[];
};

function inWindow(iso: string | null | undefined, window: SewingPeriodWindow): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= window.from_ms && t <= window.to_ms;
}

function sessionTouchesPeriod(row: SewingSession, window: SewingPeriodWindow): boolean {
  if (inWindow(row.started_at, window) || inWindow(row.ended_at, window)) return true;
  return row.status === "open" || row.status === "closing";
}

function countsTowardPerformance(row: SewingSession, window: SewingPeriodWindow): boolean {
  return row.status === "closed" && row.overtime_status !== "rejected" && inWindow(row.ended_at, window);
}

function employeeKeys(employee: Pick<PayrollEmployee, "id" | "employee_id_number">): string[] {
  return [employee.id, employee.employee_id_number]
    .map((value) => value.trim())
    .filter(Boolean);
}

function sessionMatchesKeys(row: SewingSession, keys: Set<string>): boolean {
  return keys.has(row.employee_id) || keys.has(row.employee_id_number);
}

/** Active Expats who should appear on the stitch floor (not Pattern/QC/cleaner-only). */
export function employeeExpectedOnStitchFloor(
  employee: Pick<
    PayrollEmployee,
    "is_active" | "bank_name" | "job_functions"
  >
): boolean {
  if (!employee.is_active) return false;
  if (!employeeCanSewOnStitchKiosk(employee)) return false;
  const jobs = normalizeJobFunctions(employee.job_functions);
  if (jobs.length === 0) return true;
  return jobs.some(
    (job) =>
      isTailorJobFunction(job) ||
      job === "cutter" ||
      job === "wash_iron" ||
      job === "washing" ||
      job === "ironing" ||
      job === "buttons" ||
      job === "button_stitch" ||
      job === "buttonhole" ||
      job === "champa" ||
      job === "bartek"
  );
}

function emptyPeriod(period: SewingDashboardPeriod, at: number): SewingEmployeeWorkPeriod {
  const window = sewingPeriodWindow(period, at);
  return {
    period,
    from_iso: window.from_iso,
    to_iso: window.to_iso,
    count: 0,
    duration_sec: 0,
    avg_duration_sec: 0,
    articles: [],
    sessions: [],
    open_sessions: [],
  };
}

export function emptySewingEmployeeWork(
  employee: Pick<PayrollEmployee, "id" | "full_name" | "short_name" | "employee_id_number">,
  at = Date.now()
): SewingEmployeeWorkSummary {
  return {
    employee_id: employee.id,
    employee_name: badgeDisplayName(employee),
    employee_id_number: employee.employee_id_number,
    day: emptyPeriod("day", at),
    week: emptyPeriod("week", at),
    month: emptyPeriod("month", at),
  };
}

export function sewingFloorAttendance(
  store: SewingSessionsFile,
  employees: readonly PayrollEmployee[],
  period: SewingDashboardPeriod = "day",
  at = Date.now()
): SewingFloorAttendance {
  const window = sewingPeriodWindow(period, at);
  const sessions = store.sessions ?? [];
  const expectedEmployees = employees.filter(employeeExpectedOnStitchFloor);

  const missing_rows: SewingFloorAttendanceRow[] = [];
  const scanned_rows: SewingFloorAttendanceRow[] = [];
  const seenIds = new Set<string>();

  for (const employee of expectedEmployees) {
    const keys = new Set(employeeKeys(employee));
    const theirs = sessions.filter((row) => sessionMatchesKeys(row, keys));
    const inPeriod = theirs.filter((row) => sessionTouchesPeriod(row, window));
    const live = inPeriod.some((row) => row.status === "open" || row.status === "closing");
    const scored = inPeriod.filter((row) => countsTowardPerformance(row, window));
    const duration_sec = scored.reduce((sum, row) => sum + (row.duration_sec ?? 0), 0);
    const row: SewingFloorAttendanceRow = {
      employee_id: employee.id,
      employee_name: badgeDisplayName(employee),
      employee_id_number: employee.employee_id_number,
      activity: floorActivityLabelFromJobFunctions(employee.job_functions),
      workstation_id: employee.assigned_workstation_id?.trim() || null,
      scanned: inPeriod.length > 0,
      live,
      count: scored.length,
      duration_sec,
    };
    seenIds.add(employee.id);
    if (row.scanned) scanned_rows.push(row);
    else missing_rows.push(row);
  }

  for (const session of sessions) {
    if (!sessionTouchesPeriod(session, window)) continue;
    if (seenIds.has(session.employee_id)) continue;
    const theirs = sessions.filter(
      (row) =>
        row.employee_id === session.employee_id && sessionTouchesPeriod(row, window)
    );
    if (theirs.length === 0) continue;
    seenIds.add(session.employee_id);
    const live = theirs.some((row) => row.status === "open" || row.status === "closing");
    const scored = theirs.filter((row) => countsTowardPerformance(row, window));
    scanned_rows.push({
      employee_id: session.employee_id,
      employee_name: session.employee_name,
      employee_id_number: session.employee_id_number,
      activity: floorActivityLabelFromJobFunctions(session.job_functions),
      workstation_id: session.workstation_id,
      scanned: true,
      live,
      count: scored.length,
      duration_sec: scored.reduce((sum, row) => sum + (row.duration_sec ?? 0), 0),
    });
  }

  missing_rows.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
  scanned_rows.sort(
    (a, b) =>
      Number(b.live) - Number(a.live) ||
      b.count - a.count ||
      a.employee_name.localeCompare(b.employee_name)
  );

  const pieces = scanned_rows.reduce((sum, row) => sum + row.count, 0);
  const duration_sec = scanned_rows.reduce((sum, row) => sum + row.duration_sec, 0);

  return {
    period,
    from_iso: window.from_iso,
    to_iso: window.to_iso,
    expected: expectedEmployees.length,
    scanned: scanned_rows.length,
    missing: missing_rows.length,
    live: scanned_rows.filter((row) => row.live).length,
    pieces,
    duration_sec,
    missing_rows,
    scanned_rows,
  };
}

export function parseFloorAttendancePeriod(
  value: string | null | undefined
): SewingDashboardPeriod {
  return parseSewingDashboardPeriod(value);
}
