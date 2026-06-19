import type { PayrollEmployee } from "@/lib/types/hr-payroll";

/** Prefix for employee QR scans — stable across re-imports when ID number unchanged. */
export const EMPLOYEE_QR_PREFIX = "EMP";

/** Payload encoded in each employee badge QR. */
export function employeeQrPayload(employee: Pick<PayrollEmployee, "id" | "employee_id_number">): string {
  const idNumber = employee.employee_id_number.trim();
  const id = employee.id.trim();
  return `${EMPLOYEE_QR_PREFIX}:${idNumber || id}`;
}

/** Parse badge scan — returns ID number or internal id from EMP:{value}. */
export function parseEmployeeQrPayload(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  const prefix = `${EMPLOYEE_QR_PREFIX}:`;
  if (!trimmed.startsWith(prefix)) return null;
  const value = trimmed.slice(prefix.length).trim();
  return value || null;
}

export function isEmployeeQrPayload(raw: string): boolean {
  return parseEmployeeQrPayload(raw) !== null;
}
