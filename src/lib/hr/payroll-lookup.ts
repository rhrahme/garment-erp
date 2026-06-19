import { parseEmployeeQrPayload } from "@/lib/hr/employee-qr";
import { readPayrollEmployees } from "@/lib/data/payroll-employees";
import { normalizeWorkstationId } from "@/lib/production/factory-workstations";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";
import type { ScanEmployeeContext } from "@/lib/types/production-scan";

export function findPayrollEmployeeByBadgeValue(badgeValue: string): PayrollEmployee | null {
  const parsed = parseEmployeeQrPayload(badgeValue) ?? badgeValue.trim();
  if (!parsed) return null;

  const normalized = parsed.trim();
  const upper = normalized.toUpperCase();

  return (
    readPayrollEmployees().employees.find((employee) => {
      if (!employee.is_active) return false;
      const idNumber = employee.employee_id_number.trim();
      const id = employee.id.trim();
      return (
        idNumber === normalized ||
        id === normalized ||
        idNumber.toUpperCase() === upper ||
        id.toUpperCase() === upper
      );
    }) ?? null
  );
}

export function findPayrollEmployeeById(employeeId: string): PayrollEmployee | null {
  const trimmed = employeeId.trim();
  return (
    readPayrollEmployees().employees.find(
      (employee) => employee.id === trimmed || employee.employee_id_number === trimmed
    ) ?? null
  );
}

export function resolveScanEmployeeContext(input: {
  employee_id: string;
  workstation_id?: string | null;
}): ScanEmployeeContext {
  const employee = findPayrollEmployeeById(input.employee_id);
  if (!employee) {
    throw new Error("Employee not found — scan your badge again.");
  }
  if (!employee.is_active) {
    throw new Error("Employee is inactive — contact HR.");
  }

  const override = input.workstation_id?.trim() || null;
  const assigned = employee.assigned_workstation_id?.trim() || null;
  const workstation_id = normalizeWorkstationId(override ?? assigned ?? "") ?? (override || assigned);

  return {
    employee_id: employee.id,
    employee_name: employee.full_name,
    employee_id_number: employee.employee_id_number,
    workstation_id,
  };
}

export function employeeNeedsWorkstationPick(employee: Pick<PayrollEmployee, "assigned_workstation_id" | "is_mobile_floater">): boolean {
  return Boolean(employee.is_mobile_floater) || !employee.assigned_workstation_id?.trim();
}
