import { formatClientDisplayName, formatClientShortName } from "@/lib/clients/names";
import { badgeDisplayName } from "@/lib/hr/badge-print";
import {
  isTailorJobFunction,
  normalizeJobFunctions,
  type EmployeeJobFunction,
} from "@/lib/hr/job-functions";
import type { SewingEmployeeAggregate } from "@/lib/production/sewing-session-state";
import type { ClientProfile } from "@/lib/types/clients";
import type { SewingSession, SewingSessionStatus } from "@/lib/types/sewing-sessions";

/** Client-safe short_name trim (avoids pulling payroll document I/O into the browser bundle). */
function normalizeShortName(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

/** Collapse accidental spaces around hyphens/slashes so piece QRs stay machine-readable. */
export function normalizeScanQrDisplay(value: string): string {
  return value
    .trim()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, "");
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
  const scan = normalizeScanQrDisplay(String(session.scan_code ?? ""));
  if (scan) return scan;
  const production = normalizeScanQrDisplay(String(session.production_code ?? ""));
  return production || "-";
}

/** Prefer profile first+last; fall back to stored full client_name. */
export function sewingSessionClientDisplayName(
  session: Pick<SewingSession, "client_name" | "client_short_name">,
  emptyLabel = "No client"
): string {
  const short = normalizeShortName(session.client_short_name);
  if (short) return short;
  const full = normalizeShortName(session.client_name);
  return full || emptyLabel;
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

/** Attach client first+last short names from client profiles (match full display name). */
export function attachSewingSessionClientShortNames(
  sessions: SewingSession[],
  clients: ReadonlyArray<Pick<ClientProfile, "first_name" | "middle_name" | "last_name">>
): SewingSession[] {
  const byFull = new Map<string, string>();
  for (const client of clients) {
    const full = formatClientDisplayName(client);
    const short = formatClientShortName(client);
    if (!full || !short) continue;
    byFull.set(full.toLowerCase(), short);
  }

  return sessions.map((session) => {
    const full = normalizeShortName(session.client_name);
    if (!full) {
      if (!session.client_short_name) return session;
      return { ...session, client_short_name: null };
    }
    const client_short_name = byFull.get(full.toLowerCase()) ?? null;
    if (normalizeShortName(session.client_short_name) === client_short_name) return session;
    return { ...session, client_short_name };
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
