import {
  isTailorJobFunction,
  normalizeJobFunctions,
  type EmployeeJobFunction,
} from "@/lib/hr/job-functions";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

/** Prefix for employee QR scans -- stable across re-imports when ID number unchanged. */
export const EMPLOYEE_QR_PREFIX = "EMP";

/** Alteration-mode badge QR -- same employee id, intentional alteration start. */
export const EMPLOYEE_ALTERATION_QR_PREFIX = "EMPALT";

/** Ironing activity arm. */
export const EMPLOYEE_IRONING_QR_PREFIX = "EMPIRON";

/** Buttons (button sew-on) activity arm. */
export const EMPLOYEE_BUTTONS_QR_PREFIX = "EMPBTN";

/** Washing activity arm. */
export const EMPLOYEE_WASHING_QR_PREFIX = "EMPWASH";

/** Buttonhole activity arm. */
export const EMPLOYEE_BUTTONHOLE_QR_PREFIX = "EMPHOLE";

/** Button stitch activity arm. */
export const EMPLOYEE_BUTTON_STITCH_QR_PREFIX = "EMPBST";

/** Champa activity arm. */
export const EMPLOYEE_CHAMPA_QR_PREFIX = "EMPCHMP";

/** Bartek activity arm. */
export const EMPLOYEE_BARTEK_QR_PREFIX = "EMPBART";

export type EmployeeBadgeWorkKind = "first_make" | "alteration";

/** Role chosen by an activity badge QR (null for EMP / EMPALT). */
export type EmployeeBadgeActivityJobFunction = Extract<
  EmployeeJobFunction,
  | "wash_iron"
  | "washing"
  | "ironing"
  | "buttons"
  | "button_stitch"
  | "buttonhole"
  | "champa"
  | "bartek"
>;

export type EmployeeActivityQrSpec = {
  prefix: string;
  activity: Exclude<EmployeeBadgeActivityJobFunction, "wash_iron">;
  label: string;
};

/** Activity QRs printed when that job is selected on the badge. */
export const EMPLOYEE_ACTIVITY_QR_SPECS: readonly EmployeeActivityQrSpec[] = [
  { prefix: EMPLOYEE_WASHING_QR_PREFIX, activity: "washing", label: "WASHING" },
  { prefix: EMPLOYEE_IRONING_QR_PREFIX, activity: "ironing", label: "IRONING" },
  { prefix: EMPLOYEE_BUTTONS_QR_PREFIX, activity: "buttons", label: "BUTTONS" },
  { prefix: EMPLOYEE_BUTTON_STITCH_QR_PREFIX, activity: "button_stitch", label: "BTN STITCH" },
  { prefix: EMPLOYEE_BUTTONHOLE_QR_PREFIX, activity: "buttonhole", label: "BUTTONHOLE" },
  { prefix: EMPLOYEE_CHAMPA_QR_PREFIX, activity: "champa", label: "CHAMPA" },
  { prefix: EMPLOYEE_BARTEK_QR_PREFIX, activity: "bartek", label: "BARTEK" },
];

/** All EMP* prefixes, longest first so EMP does not steal EMPIRON / EMPHOLE / ... */
export const EMPLOYEE_BADGE_QR_PREFIXES: readonly string[] = [
  ...EMPLOYEE_ACTIVITY_QR_SPECS.map((spec) => spec.prefix),
  EMPLOYEE_ALTERATION_QR_PREFIX,
  EMPLOYEE_QR_PREFIX,
].sort((a, b) => b.length - a.length || a.localeCompare(b));

export type ParsedEmployeeBadgeScan = {
  /** Employee id number or internal id (same as EMP payload value). */
  value: string;
  work_kind: EmployeeBadgeWorkKind;
  activity_job_function?: EmployeeBadgeActivityJobFunction | null;
};

function employeeIdValue(employee: Pick<PayrollEmployee, "id" | "employee_id_number">): string {
  const idNumber = employee.employee_id_number.trim();
  const id = employee.id.trim();
  return idNumber || id;
}

function prefixedPayload(
  prefix: string,
  employee: Pick<PayrollEmployee, "id" | "employee_id_number">
): string {
  return `${prefix}:${employeeIdValue(employee)}`;
}

/** Payload encoded in the normal (first-make) employee badge QR. */
export function employeeQrPayload(employee: Pick<PayrollEmployee, "id" | "employee_id_number">): string {
  return prefixedPayload(EMPLOYEE_QR_PREFIX, employee);
}

/** Payload encoded in the Alteration badge QR for the same employee. */
export function employeeAlterationQrPayload(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number">
): string {
  return prefixedPayload(EMPLOYEE_ALTERATION_QR_PREFIX, employee);
}

/** Ironing QR. */
export function employeeIroningQrPayload(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number">
): string {
  return prefixedPayload(EMPLOYEE_IRONING_QR_PREFIX, employee);
}

/** Buttons QR. */
export function employeeButtonsQrPayload(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number">
): string {
  return prefixedPayload(EMPLOYEE_BUTTONS_QR_PREFIX, employee);
}

/** Washing QR. */
export function employeeWashingQrPayload(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number">
): string {
  return prefixedPayload(EMPLOYEE_WASHING_QR_PREFIX, employee);
}

export function employeeButtonholeQrPayload(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number">
): string {
  return prefixedPayload(EMPLOYEE_BUTTONHOLE_QR_PREFIX, employee);
}

export function employeeButtonStitchQrPayload(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number">
): string {
  return prefixedPayload(EMPLOYEE_BUTTON_STITCH_QR_PREFIX, employee);
}

export function employeeChampaQrPayload(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number">
): string {
  return prefixedPayload(EMPLOYEE_CHAMPA_QR_PREFIX, employee);
}

export function employeeBartekQrPayload(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number">
): string {
  return prefixedPayload(EMPLOYEE_BARTEK_QR_PREFIX, employee);
}

function activityPayload(
  activity: Exclude<EmployeeBadgeActivityJobFunction, "wash_iron">,
  employee: Pick<PayrollEmployee, "id" | "employee_id_number">
): string {
  const spec = EMPLOYEE_ACTIVITY_QR_SPECS.find((row) => row.activity === activity);
  if (!spec) return employeeQrPayload(employee);
  return prefixedPayload(spec.prefix, employee);
}

/**
 * True when the badge should print IRONING + BUTTONS instead of SEWING + ALTERATION:
 * has wash_iron and buttons, and no tailor role.
 */
export function employeeUsesIronButtonsBadgePair(
  employee: Pick<PayrollEmployee, "job_functions">
): boolean {
  const jobs = normalizeJobFunctions(employee.job_functions);
  if (jobs.some(isTailorJobFunction)) return false;
  return jobs.includes("wash_iron") && jobs.includes("buttons");
}

/**
 * True when the badge should print WASHING + IRONING:
 * wash_iron and/or washing, no tailor, and not the Cherry iron+buttons pair.
 */
export function employeeUsesWashIronBadgePair(
  employee: Pick<PayrollEmployee, "job_functions">
): boolean {
  if (employeeUsesIronButtonsBadgePair(employee)) return false;
  const jobs = normalizeJobFunctions(employee.job_functions);
  if (jobs.some(isTailorJobFunction)) return false;
  return jobs.includes("wash_iron") || jobs.includes("washing");
}

/**
 * True when the badge should print BUTTONS (Niraj / Junaid):
 * has buttons, no tailor, and not Cherry's iron+buttons or Rohan's wash/iron pair.
 */
export function employeeUsesButtonsBadgePair(
  employee: Pick<PayrollEmployee, "job_functions">
): boolean {
  if (employeeUsesIronButtonsBadgePair(employee)) return false;
  if (employeeUsesWashIronBadgePair(employee)) return false;
  const jobs = normalizeJobFunctions(employee.job_functions);
  if (jobs.some(isTailorJobFunction)) return false;
  return jobs.includes("buttons");
}

/** Activity jobs selected on the badge that each get their own QR. */
export function employeeSelectedActivityJobs(
  employee: Pick<PayrollEmployee, "job_functions">
): Array<Exclude<EmployeeBadgeActivityJobFunction, "wash_iron">> {
  const jobs = normalizeJobFunctions(employee.job_functions);
  const selected: Array<Exclude<EmployeeBadgeActivityJobFunction, "wash_iron">> = [];
  const hasWashIron = jobs.includes("wash_iron");
  const hasButtons = jobs.includes("buttons");

  // wash_iron without an explicit washing job: Rohan gets WASHING; Cherry (also buttons) does not.
  if (jobs.includes("washing") || (hasWashIron && !hasButtons && !jobs.includes("washing"))) {
    selected.push("washing");
  }
  if (jobs.includes("ironing") || hasWashIron) {
    selected.push("ironing");
  }
  if (hasButtons) selected.push("buttons");
  if (jobs.includes("button_stitch")) selected.push("button_stitch");
  if (jobs.includes("buttonhole")) selected.push("buttonhole");
  if (jobs.includes("champa")) selected.push("champa");
  if (jobs.includes("bartek")) selected.push("bartek");
  return selected;
}

export function employeeActivityQrSides(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number" | "job_functions">
): Array<{ label: string; payload: string; activity: Exclude<EmployeeBadgeActivityJobFunction, "wash_iron"> }> {
  return employeeSelectedActivityJobs(employee).map((activity) => {
    const spec = EMPLOYEE_ACTIVITY_QR_SPECS.find((row) => row.activity === activity);
    return {
      activity,
      label: spec?.label ?? activity.toUpperCase(),
      payload: activityPayload(activity, employee),
    };
  });
}

/** EMPWASH / EMPIRON are valid when payroll has washing, ironing, or wash_iron. */
export function employeeAllowsBadgeActivity(
  jobFunctions: unknown,
  activity: EmployeeBadgeActivityJobFunction | null | undefined
): boolean {
  if (!activity) return true;
  const jobs = normalizeJobFunctions(jobFunctions);
  if (jobs.includes(activity)) return true;
  if (
    (activity === "washing" || activity === "ironing" || activity === "wash_iron") &&
    (jobs.includes("wash_iron") || jobs.includes("washing") || jobs.includes("ironing"))
  ) {
    if (activity === "washing") return jobs.includes("washing") || jobs.includes("wash_iron");
    if (activity === "ironing" || activity === "wash_iron") {
      return jobs.includes("ironing") || jobs.includes("wash_iron");
    }
  }
  return false;
}

function parsePrefixedBadgeValue(raw: string, prefix: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  const full = `${prefix}:`;
  if (!trimmed.startsWith(full)) return null;
  const value = trimmed.slice(full.length).trim();
  return value || null;
}

/** Parse normal EMP:{value} badge -- returns ID number or internal id. */
export function parseEmployeeQrPayload(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  const prefix = `${EMPLOYEE_QR_PREFIX}:`;
  if (!trimmed.startsWith(prefix)) return null;
  // Longer EMP* prefixes must not be treated as EMP:.
  for (const longer of EMPLOYEE_BADGE_QR_PREFIXES) {
    if (longer === EMPLOYEE_QR_PREFIX) continue;
    if (trimmed.startsWith(`${longer}:`)) return null;
  }
  const value = trimmed.slice(prefix.length).trim();
  return value || null;
}

/** Parse EMPALT:{value} alteration badge. */
export function parseEmployeeAlterationQrPayload(raw: string): string | null {
  return parsePrefixedBadgeValue(raw, EMPLOYEE_ALTERATION_QR_PREFIX);
}

/** Parse EMPIRON:{value} ironing activity badge. */
export function parseEmployeeIroningQrPayload(raw: string): string | null {
  return parsePrefixedBadgeValue(raw, EMPLOYEE_IRONING_QR_PREFIX);
}

/** Parse EMPBTN:{value} buttons activity badge. */
export function parseEmployeeButtonsQrPayload(raw: string): string | null {
  return parsePrefixedBadgeValue(raw, EMPLOYEE_BUTTONS_QR_PREFIX);
}

/** Parse EMPWASH:{value} washing activity badge. */
export function parseEmployeeWashingQrPayload(raw: string): string | null {
  return parsePrefixedBadgeValue(raw, EMPLOYEE_WASHING_QR_PREFIX);
}

export function parseEmployeeButtonholeQrPayload(raw: string): string | null {
  return parsePrefixedBadgeValue(raw, EMPLOYEE_BUTTONHOLE_QR_PREFIX);
}

export function parseEmployeeButtonStitchQrPayload(raw: string): string | null {
  return parsePrefixedBadgeValue(raw, EMPLOYEE_BUTTON_STITCH_QR_PREFIX);
}

export function parseEmployeeChampaQrPayload(raw: string): string | null {
  return parsePrefixedBadgeValue(raw, EMPLOYEE_CHAMPA_QR_PREFIX);
}

export function parseEmployeeBartekQrPayload(raw: string): string | null {
  return parsePrefixedBadgeValue(raw, EMPLOYEE_BARTEK_QR_PREFIX);
}

/** Parse any employee badge QR; returns null when not an employee badge. */
export function parseEmployeeBadgeScan(raw: string): ParsedEmployeeBadgeScan | null {
  for (const spec of EMPLOYEE_ACTIVITY_QR_SPECS) {
    const value = parsePrefixedBadgeValue(raw, spec.prefix);
    if (value) {
      return {
        value,
        work_kind: "first_make",
        activity_job_function: spec.activity,
      };
    }
  }
  const alteration = parseEmployeeAlterationQrPayload(raw);
  if (alteration) {
    return { value: alteration, work_kind: "alteration", activity_job_function: null };
  }
  const firstMake = parseEmployeeQrPayload(raw);
  if (firstMake) {
    return { value: firstMake, work_kind: "first_make", activity_job_function: null };
  }
  return null;
}

export function isEmployeeQrPayload(raw: string): boolean {
  return parseEmployeeQrPayload(raw) !== null;
}

export function isEmployeeAlterationQrPayload(raw: string): boolean {
  return parseEmployeeAlterationQrPayload(raw) !== null;
}

export function isEmployeeIroningQrPayload(raw: string): boolean {
  return parseEmployeeIroningQrPayload(raw) !== null;
}

export function isEmployeeButtonsQrPayload(raw: string): boolean {
  return parseEmployeeButtonsQrPayload(raw) !== null;
}

export function isEmployeeWashingQrPayload(raw: string): boolean {
  return parseEmployeeWashingQrPayload(raw) !== null;
}

/** True for EMP: / EMPALT: / activity EMP* badge scans. */
export function isAnyEmployeeBadgeQrPayload(raw: string): boolean {
  return parseEmployeeBadgeScan(raw) !== null;
}
