import type { PayrollEmployee } from "@/lib/types/hr-payroll";

/** Prefix for employee QR scans — stable across re-imports when ID number unchanged. */
export const EMPLOYEE_QR_PREFIX = "EMP";

/** Alteration-mode badge QR — same employee id, intentional alteration start. */
export const EMPLOYEE_ALTERATION_QR_PREFIX = "EMPALT";

export type EmployeeBadgeWorkKind = "first_make" | "alteration";

export type ParsedEmployeeBadgeScan = {
  /** Employee id number or internal id (same as EMP payload value). */
  value: string;
  work_kind: EmployeeBadgeWorkKind;
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

/** Parse normal EMP:{value} badge — returns ID number or internal id. */
export function parseEmployeeQrPayload(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  const prefix = `${EMPLOYEE_QR_PREFIX}:`;
  if (!trimmed.startsWith(prefix)) return null;
  // Do not treat EMPALT: as EMP: (EMPALT also starts with "EMP").
  if (trimmed.startsWith(`${EMPLOYEE_ALTERATION_QR_PREFIX}:`)) return null;
  const value = trimmed.slice(prefix.length).trim();
  return value || null;
}

/** Parse EMPALT:{value} alteration badge. */
export function parseEmployeeAlterationQrPayload(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  const prefix = `${EMPLOYEE_ALTERATION_QR_PREFIX}:`;
  if (!trimmed.startsWith(prefix)) return null;
  const value = trimmed.slice(prefix.length).trim();
  return value || null;
}

/** Parse either badge QR; returns null when not an employee badge. */
export function parseEmployeeBadgeScan(raw: string): ParsedEmployeeBadgeScan | null {
  const alteration = parseEmployeeAlterationQrPayload(raw);
  if (alteration) {
    return { value: alteration, work_kind: "alteration" };
  }
  const firstMake = parseEmployeeQrPayload(raw);
  if (firstMake) {
    return { value: firstMake, work_kind: "first_make" };
  }
  return null;
}

export function isEmployeeQrPayload(raw: string): boolean {
  return parseEmployeeQrPayload(raw) !== null;
}

export function isEmployeeAlterationQrPayload(raw: string): boolean {
  return parseEmployeeAlterationQrPayload(raw) !== null;
}

/** True for EMP: or EMPALT: badge scans. */
export function isAnyEmployeeBadgeQrPayload(raw: string): boolean {
  return parseEmployeeBadgeScan(raw) !== null;
}
