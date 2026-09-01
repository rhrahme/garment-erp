export type PayrollAdjustmentKind = "overtime" | "deduction";

export type PayrollAdjustment = {
  id: string;
  employee_id: string;
  kind: PayrollAdjustmentKind;
  /** Always positive SAR. Overtime adds pay; deduction subtracts. */
  amount: number;
  /** Optional overtime hours. */
  hours: number | null;
  note: string;
  created_at: string;
  created_by: string | null;
};

export type PayrollAdjustmentsFile = {
  updated_at: string | null;
  adjustments: PayrollAdjustment[];
};

export const EMPTY_PAYROLL_ADJUSTMENTS: PayrollAdjustmentsFile = {
  updated_at: null,
  adjustments: [],
};
