import { badgeDisplayName } from "@/lib/hr/badge-print";
import {
  isTailorJobFunction,
  normalizeJobFunctions,
  type EmployeeJobFunction,
} from "@/lib/hr/job-functions";
import type { SewingEmployeeAggregate } from "@/lib/production/sewing-session-state";
import type { SewingSession, SewingSessionStatus } from "@/lib/types/sewing-sessions";

/** Client-safe short_name trim (avoids pulling payroll document I/O into the browser bundle). */
function normalizeShortName(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

/**
 * Floor activity verb for an open stitch-kiosk session, derived from HR job roles.
 * Tailors stay "Sewing"; cutters / wash / buttons / etc. get matching labels so Live
 * does not claim a cutter is sewing.
 */
export function floorActivityLabelFromJobFunctions(values: unknown): string {
  const jobs = normalizeJobFunctions(values);
  if (jobs.some(isTailorJobFunction)) return "Sewing";
  if (jobs.includes("cutter")) return "Cutting";
  if (jobs.includes("wash_iron")) return "Wash / iron";
  if (jobs.includes("buttons")) return "Buttons";
  if (jobs.includes("pattern")) return "Pattern";
  if (jobs.includes("qc")) return "QC";
  if (jobs.includes("cleaner")) return "Cleaning";
  return "Sewing";
}

/** Display label for Live / History status badges (job-aware when open). */
export function sewingSessionStatusLabel(
  status: SewingSessionStatus,
  jobFunctions?: unknown
): string {
  if (status === "closing") return "Closing";
  if (status === "closed") return "Closed";
  if (status === "abandoned") return "Abandoned";
  return floorActivityLabelFromJobFunctions(jobFunctions);
}

/** Badge short name when set; otherwise the stored session employee_name. */
export function sewingSessionEmployeeDisplayName(
  session: Pick<SewingSession, "employee_name" | "employee_short_name">
): string {
  return badgeDisplayName({
    full_name: session.employee_name,
    short_name: session.employee_short_name,
  });
}

/** Raw piece QR that opened/closed the session (scan_code), falling back to production_code. */
export function sewingSessionScanQrLabel(
  session: Pick<SewingSession, "scan_code" | "production_code">
): string {
  const scan = String(session.scan_code ?? "").trim();
  if (scan) return scan;
  const production = String(session.production_code ?? "").trim();
  return production || "-";
}

export type SewingSessionPayrollLookup = {
  job_functions?: readonly string[] | null;
  short_name?: string | null;
};

/** Attach payroll job_functions + short_name onto sessions for dashboard UI. */
export function attachSewingSessionJobFunctions(
  sessions: SewingSession[],
  lookup: (employeeId: string) => SewingSessionPayrollLookup | null | undefined
): SewingSession[] {
  return sessions.map((session) => {
    const emp = lookup(session.employee_id);
    const job_functions: EmployeeJobFunction[] = normalizeJobFunctions(
      emp?.job_functions ?? session.job_functions
    );
    const employee_short_name = emp
      ? normalizeShortName(emp.short_name)
      : normalizeShortName(session.employee_short_name);

    const sameJobs =
      Boolean(session.job_functions) &&
      session.job_functions!.length === job_functions.length &&
      session.job_functions!.every((fn, i) => fn === job_functions[i]);
    const sameShort =
      normalizeShortName(session.employee_short_name) === employee_short_name;

    if (sameJobs && sameShort) return session;
    return { ...session, job_functions, employee_short_name };
  });
}

/** Prefer badge short names on Performance / today aggregates. */
export function applyShortNamesToEmployeeAggregates(
  rows: SewingEmployeeAggregate[],
  lookup: (employeeId: string) => SewingSessionPayrollLookup | null | undefined
): SewingEmployeeAggregate[] {
  return rows.map((row) => {
    const emp = lookup(row.employee_id);
    const employee_name = badgeDisplayName({
      full_name: row.employee_name,
      short_name: emp?.short_name,
    });
    if (employee_name === row.employee_name) return row;
    return { ...row, employee_name };
  });
}
