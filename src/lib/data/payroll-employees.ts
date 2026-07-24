import path from "path";
import { readJsonFile } from "@/lib/data/json-file-cache";
import { saveDocument } from "@/lib/data/document-persistence";
import { idBadgeGroup, type IdBadgeGroup } from "@/lib/hr/payroll-utils";
import type { PayrollEmployee, PayrollEmployeesFile, PayrollSummary } from "@/lib/types/hr-payroll";

const PAYROLL_PATH = path.join(process.cwd(), "src/data/payroll-employees.json");

const EMPTY: PayrollEmployeesFile = {
  updated_at: null,
  source_file: "",
  currency: "SAR",
  employees: [],
};

/** Bank labels used only for Saudi/expat badge grouping — not payroll amounts. */
const BADGE_GROUP_BANK: Record<IdBadgeGroup, string> = {
  saudi: "AL RAJHI BANK",
  expat: "Banque Saudi Fransi",
};

export function readPayrollEmployees(): PayrollEmployeesFile {
  return readJsonFile(PAYROLL_PATH, EMPTY);
}

export async function writePayrollEmployees(data: PayrollEmployeesFile): Promise<PayrollEmployeesFile> {
  const payload: PayrollEmployeesFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(PAYROLL_PATH, payload);
}

export type CreatePayrollEmployeeInput = {
  full_name: string;
  employee_id_number: string;
  /** Controls ID-badge Saudis/Expats tab; defaults to saudi. */
  badge_group?: IdBadgeGroup;
  bank_name?: string;
  assigned_workstation_id?: string | null;
  is_mobile_floater?: boolean;
  /** Admin-only payroll fields — omitted on floor create (zeros / empty). */
  includePayrollFields?: boolean;
  salary_amount?: number;
  basic_salary?: number;
  housing_allowance?: number;
  other_earnings?: number;
  deduction?: number;
  account_number?: string;
  payment_description?: string;
  address_1?: string;
  address_2?: string;
  address_3?: string;
};

export type PublicEmployeeIdentity = {
  id: string;
  employee_id_number: string;
  full_name: string;
  badge_group: IdBadgeGroup;
  assigned_workstation_id: string | null;
  is_mobile_floater: boolean;
  is_active: boolean;
};

export function toPublicEmployeeIdentity(employee: PayrollEmployee): PublicEmployeeIdentity {
  return {
    id: employee.id,
    employee_id_number: employee.employee_id_number,
    full_name: employee.full_name,
    badge_group: idBadgeGroup(employee),
    assigned_workstation_id: employee.assigned_workstation_id ?? null,
    is_mobile_floater: Boolean(employee.is_mobile_floater),
    is_active: employee.is_active,
  };
}

function normalizeIdNumber(value: string): string {
  return value.trim();
}

export async function createPayrollEmployee(input: CreatePayrollEmployeeInput): Promise<PayrollEmployee> {
  const full_name = input.full_name.trim();
  const employee_id_number = normalizeIdNumber(input.employee_id_number);
  if (!full_name) {
    throw new Error("Full name is required.");
  }
  if (!employee_id_number) {
    throw new Error("Employee ID number is required.");
  }

  const store = readPayrollEmployees();
  const duplicate = store.employees.find(
    (employee) =>
      employee.employee_id_number === employee_id_number || employee.id === employee_id_number
  );
  if (duplicate) {
    throw new Error("An employee with this ID number already exists.");
  }

  const badge_group: IdBadgeGroup = input.badge_group === "expat" ? "expat" : "saudi";
  const bank_name = (input.bank_name?.trim() || BADGE_GROUP_BANK[badge_group]).trim();
  const nextSNo =
    store.employees.reduce((max, employee) => Math.max(max, employee.s_no || 0), 0) + 1;

  const includePayroll = Boolean(input.includePayrollFields);
  const employee: PayrollEmployee = {
    id: employee_id_number,
    s_no: nextSNo,
    employee_id_number,
    full_name,
    bank_name,
    account_number: includePayroll ? String(input.account_number ?? "").trim() : "",
    salary_amount: includePayroll ? Number(input.salary_amount ?? 0) || 0 : 0,
    basic_salary: includePayroll ? Number(input.basic_salary ?? 0) || 0 : 0,
    housing_allowance: includePayroll ? Number(input.housing_allowance ?? 0) || 0 : 0,
    other_earnings: includePayroll ? Number(input.other_earnings ?? 0) || 0 : 0,
    deduction: includePayroll ? Number(input.deduction ?? 0) || 0 : 0,
    payment_description: includePayroll
      ? String(input.payment_description ?? "SALARY").trim() || "SALARY"
      : "SALARY",
    address_1: includePayroll ? String(input.address_1 ?? "").trim() : "",
    address_2: includePayroll ? String(input.address_2 ?? "").trim() : "",
    address_3: includePayroll ? String(input.address_3 ?? "").trim() : "",
    is_active: true,
    assigned_workstation_id: input.assigned_workstation_id ?? null,
    is_mobile_floater: Boolean(input.is_mobile_floater),
  };

  store.employees.push(employee);
  if (!store.source_file) {
    store.source_file = "manual-create";
  }
  await writePayrollEmployees(store);
  return employee;
}

export async function updatePayrollEmployee(
  id: string,
  patch: Partial<Pick<PayrollEmployee, "assigned_workstation_id" | "is_mobile_floater">>
): Promise<PayrollEmployee> {
  const store = readPayrollEmployees();
  const index = store.employees.findIndex(
    (employee) => employee.id === id || employee.employee_id_number === id
  );
  if (index < 0) {
    throw new Error("Employee not found.");
  }

  const updated: PayrollEmployee = {
    ...store.employees[index]!,
    ...patch,
  };
  store.employees[index] = updated;
  await writePayrollEmployees(store);
  return updated;
}

export function getPayrollSummary(file: PayrollEmployeesFile = readPayrollEmployees()): PayrollSummary {
  const active = file.employees.filter((employee) => employee.is_active);
  const totalPayroll = active.reduce((sum, employee) => sum + employee.salary_amount, 0);
  const totalDeductions = active.reduce((sum, employee) => sum + employee.deduction, 0);
  const banks = new Set(active.map((employee) => employee.bank_name).filter(Boolean));

  return {
    employee_count: file.employees.length,
    active_count: active.length,
    total_payroll_sar: Math.round(totalPayroll * 100) / 100,
    average_salary_sar: active.length > 0 ? Math.round((totalPayroll / active.length) * 100) / 100 : 0,
    total_deductions_sar: Math.round(totalDeductions * 100) / 100,
    bank_count: banks.size,
  };
}
