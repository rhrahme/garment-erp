import { formatClientDisplayName, formatClientShortName } from "@/lib/clients/names";
import { badgeDisplayName } from "@/lib/hr/badge-print";
import {
  isTailorJobFunction,
  normalizeJobFunctions,
  type EmployeeJobFunction,
} from "@/lib/hr/job-functions";
import type { SewingEmployeeAggregate } from "@/lib/production/sewing-session-state";
import type { ClientProfile } from "@/lib/types/clients";
import type {
  SewingSession,
  SewingSessionStatus,
  SewingWorkKind,
} from "@/lib/types/sewing-sessions";

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
 * Single source of truth for Stitch activity language: the employee's badge
 * job_functions (expat ID badge roles). Tailor roles -> Sewing; cutter-only ->
 * Cutting; wash/iron, buttons, etc. match their badge job.
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

/**
 * Cutters may open many A4s (stacked consolidated nest) before closing.
 * Tailors keep one-open-at-a-time (Sewing wins over cutter on dual roles).
 */
export function employeeAllowsStackedOpenPieces(jobFunctions: unknown): boolean {
  return floorActivityLabelFromJobFunctions(jobFunctions) === "Cutting";
}

/**
 * Label when a dual-role badge armed a specific activity (EMPIRON / EMPBTN).
 * wash_iron arms show "Ironing" (not the payroll "Wash / iron" catalog label).
 */
export function floorActivityLabelFromActivityJobFunction(
  activity: EmployeeJobFunction | null | undefined
): string | null {
  if (activity === "wash_iron") return "Ironing";
  if (activity === "buttons") return "Buttons";
  return null;
}

/** Resolve Live/Scan activity label: armed role wins, else job_functions priority. */
export function resolveFloorActivityLabel(
  jobFunctions?: unknown,
  workKind?: SewingWorkKind | null,
  activityJobFunction?: EmployeeJobFunction | null
): string {
  if (workKind === "alteration") return "Alteration";
  const armed = floorActivityLabelFromActivityJobFunction(activityJobFunction);
  if (armed) return armed;
  return floorActivityLabelFromJobFunctions(jobFunctions);
}

/** Display label for Live / History status badges (job-aware when open). */
export function sewingSessionStatusLabel(
  status: SewingSessionStatus,
  jobFunctions?: unknown,
  workKind?: SewingWorkKind | null,
  activityJobFunction?: EmployeeJobFunction | null
): string {
  if (status === "closing") {
    return workKind === "alteration" ? "Closing alteration" : "Closing";
  }
  if (status === "closed") {
    return workKind === "alteration" ? "Alteration done" : "Closed";
  }
  if (status === "abandoned") return "Abandoned";
  return resolveFloorActivityLabel(jobFunctions, workKind, activityJobFunction);
}

/** Tailwind classes for Live / History status pills (amber = alteration). */
export function sewingSessionStatusBadgeClass(
  status: SewingSessionStatus,
  workKind?: SewingWorkKind | null
): string {
  if (workKind === "alteration" && status !== "closed" && status !== "abandoned") {
    return "bg-amber-100 text-amber-900";
  }
  if (status === "closed") return "bg-slate-100 text-slate-700";
  if (status === "closing") return "bg-sky-100 text-sky-800";
  if (status === "abandoned") return "bg-slate-100 text-slate-600";
  return "bg-emerald-100 text-emerald-800";
}

/** Scan kiosk primary heading while a piece session is open. */
export function floorActivityInProgressLabel(
  values: unknown,
  workKind?: SewingWorkKind | null,
  activityJobFunction?: EmployeeJobFunction | null
): string {
  if (workKind === "alteration") return "Alteration in progress";
  return `${resolveFloorActivityLabel(values, workKind, activityJobFunction)} in progress`;
}

/** Orders board caption for a live open session (Cutting now / Sewing now / ...). */
export function floorActivityNowLabel(
  values: unknown,
  workKind?: SewingWorkKind | null,
  activityJobFunction?: EmployeeJobFunction | null
): string {
  if (workKind === "alteration") return "Alteration now";
  return `${resolveFloorActivityLabel(values, workKind, activityJobFunction)} now`;
}

/**
 * Last-scan / log line when a session starts, e.g. "Abdullah sewing FR-0129-L10-OS-1/2."
 * Same badge-job helper as Live / Scan ("Cutting" / "Sewing" / ...).
 */
export function floorActivitySessionStartedMessage(
  employeeName: string,
  jobFunctions: unknown,
  productionCode: string,
  pieceMark?: string | null,
  workKind?: SewingWorkKind | null,
  activityJobFunction?: EmployeeJobFunction | null
): string {
  const activity = resolveFloorActivityLabel(
    jobFunctions,
    workKind,
    activityJobFunction
  ).toLowerCase();
  const mark = pieceMark?.trim() ? ` (${pieceMark.trim()})` : "";
  return `${employeeName} ${activity} ${productionCode}${mark}.`;
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
