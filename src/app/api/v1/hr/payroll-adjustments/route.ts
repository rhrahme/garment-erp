import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  createPayrollAdjustment,
  deletePayrollAdjustment,
  readPayrollAdjustmentsFresh,
} from "@/lib/data/payroll-adjustments";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { notifyIntegration } from "@/lib/integrations";

/** Zapier parity: list, add, or remove overtime / mistake deductions. */
export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["payroll_adjustments"]);
  const store = await readPayrollAdjustmentsFresh();
  return NextResponse.json({ adjustments: store.adjustments });
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["payroll_adjustments", "payroll_employees"]);

  let body: {
    employee_id?: string;
    kind?: string;
    amount?: number | string;
    hours?: number | string | null;
    note?: string | null;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const adjustment = await createPayrollAdjustment(body, "api");
    const event =
      adjustment.kind === "overtime" ? "payroll.overtime_added" : "payroll.deduction_added";
    await notifyIntegration(event, {
      adjustment_id: adjustment.id,
      employee_id: adjustment.employee_id,
      amount: adjustment.amount,
      hours: adjustment.hours,
      note: adjustment.note,
      by: "api",
    }).catch(() => {});
    return NextResponse.json({ adjustment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;
  await ensureDocumentsLoaded(["payroll_adjustments"]);

  let body: { id?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const adjustment = await deletePayrollAdjustment(String(body.id ?? "").trim());
    await notifyIntegration("payroll.adjustment_deleted", {
      adjustment_id: adjustment.id,
      employee_id: adjustment.employee_id,
      kind: adjustment.kind,
      amount: adjustment.amount,
      by: "api",
    }).catch(() => {});
    return NextResponse.json({ adjustment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete." },
      { status: 400 }
    );
  }
}
