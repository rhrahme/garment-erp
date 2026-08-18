import type { EmployeeJobFunction } from "@/lib/hr/job-functions";

export type PayrollEmployee = {
  id: string;
  s_no: number;
  employee_id_number: string;
  full_name: string;
  /** Optional nickname for ID badge cards only; ERP lists keep full_name. */
  short_name?: string | null;
  bank_name: string;
  account_number: string;
  salary_amount: number;
  basic_salary: number;
  housing_allowance: number;
  other_earnings: number;
  deduction: number;
  payment_description: string;
  address_1: string;
  address_2: string;
  address_3: string;
  is_active: boolean;
  /** Floor map workstation ID, e.g. PL-3-5 */
  assigned_workstation_id?: string | null;
  /** Floater — may pick a station once per shift when scanning */
  is_mobile_floater?: boolean;
  /** Factory roles (tailor specialties, cutter, QC, etc.) — multi-select. */
  job_functions?: EmployeeJobFunction[];
  /** When the employee was added to the ERP. Missing = pre-dates tracking (imported with the original payroll sheet). */
  created_at?: string | null;
};

export type PayrollEmployeesFile = {
  updated_at: string | null;
  source_file: string;
  currency: "SAR";
  employees: PayrollEmployee[];
};

export type PayrollSummary = {
  employee_count: number;
  active_count: number;
  total_payroll_sar: number;
  average_salary_sar: number;
  total_deductions_sar: number;
  bank_count: number;
};
