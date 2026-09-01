import path from "path";
import {
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import { readPayrollEmployees } from "@/lib/data/payroll-employees";
import {
  EMPTY_PAYROLL_ADJUSTMENTS,
  type PayrollAdjustment,
  type PayrollAdjustmentKind,
  type PayrollAdjustmentsFile,
} from "@/lib/types/payroll-adjustments";

const STORE_PATH = path.join(process.cwd(), "src/data/payroll-adjustments.json");

function newId(): string {
  return `padj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function readPayrollAdjustmentsFresh(): Promise<PayrollAdjustmentsFile> {
  const store = await readJsonFileFreshAsync(STORE_PATH, EMPTY_PAYROLL_ADJUSTMENTS);
  return {
    updated_at: store.updated_at ?? null,
    adjustments: Array.isArray(store.adjustments) ? store.adjustments : [],
  };
}

export function resolvePayrollAdjustmentAmount(raw: unknown): number {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter an amount in SAR.");
  }
  return Math.round(amount * 100) / 100;
}

export function resolvePayrollAdjustmentInput(input: {
  employee_id?: string;
  kind?: string;
  amount?: unknown;
  hours?: unknown;
  note?: string | null;
}): { employee_id: string; kind: PayrollAdjustmentKind; amount: number; hours: number | null; note: string } {
  const employeeId = String(input.employee_id ?? "").trim();
  if (!employeeId) throw new Error("Pick an employee.");
  const kind = String(input.kind ?? "").trim();
  if (kind !== "overtime" && kind !== "deduction") {
    throw new Error("Choose overtime or a mistake deduction.");
  }
  const amount = resolvePayrollAdjustmentAmount(input.amount);
  const note = String(input.note ?? "").trim();
  if (kind === "deduction" && !note) {
    throw new Error("Write what the mistake was.");
  }
  let hours: number | null = null;
  if (input.hours != null && String(input.hours).trim() !== "") {
    const parsed = Number(input.hours);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("Hours must be a positive number.");
    }
    hours = Math.round(parsed * 100) / 100;
  }
  return { employee_id: employeeId, kind, amount, hours, note };
}

export async function createPayrollAdjustment(
  input: {
    employee_id?: string;
    kind?: string;
    amount?: unknown;
    hours?: unknown;
    note?: string | null;
  },
  actedBy: string | null
): Promise<PayrollAdjustment> {
  const resolved = resolvePayrollAdjustmentInput(input);
  const payroll = readPayrollEmployees();
  const employee = payroll.employees.find((row) => row.id === resolved.employee_id);
  if (!employee) throw new Error("Employee not found.");

  const store = await readPayrollAdjustmentsFresh();
  const row: PayrollAdjustment = {
    id: newId(),
    employee_id: resolved.employee_id,
    kind: resolved.kind,
    amount: resolved.amount,
    hours: resolved.hours,
    note: resolved.note,
    created_at: new Date().toISOString(),
    created_by: actedBy?.trim() || null,
  };
  store.adjustments.push(row);
  store.updated_at = row.created_at;
  await saveDocument(STORE_PATH, store);
  return row;
}

export async function deletePayrollAdjustment(id: string): Promise<PayrollAdjustment> {
  const store = await readPayrollAdjustmentsFresh();
  const index = store.adjustments.findIndex((row) => row.id === id);
  if (index < 0) throw new Error("Adjustment not found.");
  const [removed] = store.adjustments.splice(index, 1);
  store.updated_at = new Date().toISOString();
  await saveDocument(STORE_PATH, store);
  return removed;
}
