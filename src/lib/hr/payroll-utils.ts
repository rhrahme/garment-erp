import type { PayrollEmployee } from "@/lib/types/hr-payroll";

/** ID badge tabs — expats are paid via BSF or ANB; all other banks (or missing bank) are Saudi. */
export type IdBadgeGroup = "saudi" | "expat";

const EXPAT_BANK_PATTERNS = [
  /\b(?:banque\s+)?saudi\s+fransi\b/i,
  /\bbsf\b/i,
  /\barab\s+national(?:\s+bank)?\b/i,
  /\banb\b/i,
];

function normalizeBankName(bankName: string): string {
  return bankName.trim().replace(/\s+/g, " ");
}

/** Expats: Banque Saudi Fransi / BSF or Arab National Bank / ANB. Missing bank defaults to Saudi. */
export function isExpatEmployee(employee: Pick<PayrollEmployee, "bank_name">): boolean {
  const bank = normalizeBankName(employee.bank_name ?? "");
  if (!bank) return false;
  return EXPAT_BANK_PATTERNS.some((pattern) => pattern.test(bank));
}

/**
 * Who may arm / start a sewing session on the stitch kiosk.
 * Any employee on the HR Expats ID-badge list (BSF/ANB bank group) may scan —
 * cutters, wash/iron, buttons, tailors, etc. Saudis / unknown badges stay out.
 */
export function employeeCanSewOnStitchKiosk(
  employee: Pick<PayrollEmployee, "bank_name"> | null | undefined
): boolean {
  if (!employee) return false;
  return isExpatEmployee(employee);
}

export function idBadgeGroup(employee: Pick<PayrollEmployee, "bank_name">): IdBadgeGroup {
  return isExpatEmployee(employee) ? "expat" : "saudi";
}

export function filterPayrollEmployeesByGroup(
  employees: PayrollEmployee[],
  group: IdBadgeGroup
): PayrollEmployee[] {
  return employees.filter((employee) => idBadgeGroup(employee) === group);
}

export function maskAccountNumber(accountNumber: string): string {
  const trimmed = accountNumber.trim();
  if (trimmed.length <= 4) return trimmed;
  return `•••• ${trimmed.slice(-4)}`;
}

export function sortPayrollEmployees(employees: PayrollEmployee[]): PayrollEmployee[] {
  return [...employees].sort((a, b) => a.full_name.localeCompare(b.full_name));
}
