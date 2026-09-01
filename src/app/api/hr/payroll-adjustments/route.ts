import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  createPayrollAdjustment,
  deletePayrollAdjustment,
  readPayrollAdjustmentsFresh,
} from "@/lib/data/payroll-adjustments";
import { notifyIntegration } from "@/lib/integrations";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  await ensureDocumentsLoaded(["payroll_adjustments", "payroll_employees"]);
  const store = await readPayrollAdjustmentsFresh();
  return NextResponse.json({ adjustments: store.adjustments });
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
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
    const adjustment = await createPayrollAdjustment(body, session.email);
    const event =
      adjustment.kind === "overtime" ? "payroll.overtime_added" : "payroll.deduction_added";
    await notifyIntegration(event, {
      adjustment_id: adjustment.id,
      employee_id: adjustment.employee_id,
      amount: adjustment.amount,
      hours: adjustment.hours,
      note: adjustment.note,
      by: session.email,
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
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
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
      by: session.email,
    }).catch(() => {});
    return NextResponse.json({ adjustment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete." },
      { status: 400 }
    );
  }
}
