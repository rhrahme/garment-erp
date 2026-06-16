import type { PayrollEmployee } from "@/lib/types/hr-payroll";

/** Saudi national ID vs Iqama (expat residency) — first digit of Emp. ID. No. from payroll. */
export type IdBadgeGroup = "saudi" | "expat";

export function idBadgeGroup(employee: Pick<PayrollEmployee, "employee_id_number">): IdBadgeGroup {
  const idNumber = employee.employee_id_number.trim();
  return idNumber.startsWith("2") ? "expat" : "saudi";
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
