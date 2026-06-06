import type { PayrollEmployee } from "@/lib/types/hr-payroll";

export function maskAccountNumber(accountNumber: string): string {
  const trimmed = accountNumber.trim();
  if (trimmed.length <= 4) return trimmed;
  return `•••• ${trimmed.slice(-4)}`;
}

export function sortPayrollEmployees(employees: PayrollEmployee[]): PayrollEmployee[] {
  return [...employees].sort((a, b) => a.full_name.localeCompare(b.full_name));
}
