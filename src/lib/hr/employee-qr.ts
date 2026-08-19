import {
  isTailorJobFunction,
  normalizeJobFunctions,
  type EmployeeJobFunction,
} from "@/lib/hr/job-functions";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

/** Prefix for employee QR scans — stable across re-imports when ID number unchanged. */
export const EMPLOYEE_QR_PREFIX = "EMP";

/** Alteration-mode badge QR — same employee id, intentional alteration start. */
export const EMPLOYEE_ALTERATION_QR_PREFIX = "EMPALT";

/** Ironing activity arm for wash_iron + buttons dual-role badges. */
export const EMPLOYEE_IRONING_QR_PREFIX = "EMPIRON";

/** Buttons activity arm for wash_iron + buttons dual-role badges. */
export const EMPLOYEE_BUTTONS_QR_PREFIX = "EMPBTN";

/** Washing activity arm for wash / iron badges (Rohan). */
export const EMPLOYEE_WASHING_QR_PREFIX = "EMPWASH";

export type EmployeeBadgeWorkKind = "first_make" | "alteration";

/** Role chosen by EMPIRON / EMPBTN / EMPWASH (null for EMP / EMPALT). */
export type EmployeeBadgeActivityJobFunction = Extract<
  EmployeeJobFunction,
  "wash_iron" | "buttons" | "washing"
>;

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

/** Payload encoded in the normal (first-make) employee badge QR. */
export function employeeQrPayload(employee: Pick<PayrollEmployee, "id" | "employee_id_number">): string {
  return `${EMPLOYEE_QR_PREFIX}:${employeeIdValue(employee)}`;
}

/** Payload encoded in the Alteration badge QR for the same employee. */
export function employeeAlterationQrPayload(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number">
): string {
  return `${EMPLOYEE_ALTERATION_QR_PREFIX}:${employeeIdValue(employee)}`;
}

/** Ironing QR for dual-role wash_iron + buttons badges. */
export function employeeIroningQrPayload(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number">
): string {
  return `${EMPLOYEE_IRONING_QR_PREFIX}:${employeeIdValue(employee)}`;
}

/** Buttons QR for dual-role wash_iron + buttons badges. */
export function employeeButtonsQrPayload(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number">
): string {
  return `${EMPLOYEE_BUTTONS_QR_PREFIX}:${employeeIdValue(employee)}`;
}

/** Washing QR for wash / iron badges. */
export function employeeWashingQrPayload(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number">
): string {
  return `${EMPLOYEE_WASHING_QR_PREFIX}:${employeeIdValue(employee)}`;
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
 * True when the badge should print BUTTONS + BUTTONS (Niraj / Junaid):
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

/** EMPWASH / EMPIRON are valid when payroll has washing or wash_iron. */
export function employeeAllowsBadgeActivity(
  jobFunctions: unknown,
  activity: EmployeeBadgeActivityJobFunction | null | undefined
): boolean {
  if (!activity) return true;
  const jobs = normalizeJobFunctions(jobFunctions);
  if (jobs.includes(activity)) return true;
  if (
    (activity === "washing" || activity === "wash_iron") &&
    (jobs.includes("wash_iron") || jobs.includes("washing"))
  ) {
    return true;
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

/** Parse normal EMP:{value} badge — returns ID number or internal id. */
export function parseEmployeeQrPayload(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  const prefix = `${EMPLOYEE_QR_PREFIX}:`;
  if (!trimmed.startsWith(prefix)) return null;
  // Longer EMP* prefixes must not be treated as EMP:.
  if (trimmed.startsWith(`${EMPLOYEE_ALTERATION_QR_PREFIX}:`)) return null;
  if (trimmed.startsWith(`${EMPLOYEE_IRONING_QR_PREFIX}:`)) return null;
  if (trimmed.startsWith(`${EMPLOYEE_BUTTONS_QR_PREFIX}:`)) return null;
  if (trimmed.startsWith(`${EMPLOYEE_WASHING_QR_PREFIX}:`)) return null;
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

/** Parse any employee badge QR; returns null when not an employee badge. */
export function parseEmployeeBadgeScan(raw: string): ParsedEmployeeBadgeScan | null {
  // Longer prefixes before EMPALT / EMP (EMP is a prefix of EMPIRON / EMPBTN / EMPALT / EMPWASH).
  const washing = parseEmployeeWashingQrPayload(raw);
  if (washing) {
    return {
      value: washing,
      work_kind: "first_make",
      activity_job_function: "washing",
    };
  }
  const ironing = parseEmployeeIroningQrPayload(raw);
  if (ironing) {
    return {
      value: ironing,
      work_kind: "first_make",
      activity_job_function: "wash_iron",
    };
  }
  const buttons = parseEmployeeButtonsQrPayload(raw);
  if (buttons) {
    return {
      value: buttons,
      work_kind: "first_make",
      activity_job_function: "buttons",
    };
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

/** True for EMP: / EMPALT: / EMPIRON: / EMPBTN: / EMPWASH: badge scans. */
export function isAnyEmployeeBadgeQrPayload(raw: string): boolean {
  return parseEmployeeBadgeScan(raw) !== null;
}
