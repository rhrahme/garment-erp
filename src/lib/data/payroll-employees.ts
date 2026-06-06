import path from "path";
import { readJsonFile } from "@/lib/data/json-file-cache";
import type { PayrollEmployee, PayrollEmployeesFile, PayrollSummary } from "@/lib/types/hr-payroll";

const PAYROLL_PATH = path.join(process.cwd(), "src/data/payroll-employees.json");

const EMPTY: PayrollEmployeesFile = {
  updated_at: null,
  source_file: "",
  currency: "SAR",
  employees: [],
};

export function readPayrollEmployees(): PayrollEmployeesFile {
  return readJsonFile(PAYROLL_PATH, EMPTY);
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
