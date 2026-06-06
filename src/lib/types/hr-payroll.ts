export type PayrollEmployee = {
  id: string;
  s_no: number;
  employee_id_number: string;
  full_name: string;
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
