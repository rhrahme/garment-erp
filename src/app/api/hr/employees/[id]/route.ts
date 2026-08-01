import { NextResponse } from "next/server";
import { requireFactoryOpsAccess } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  normalizeShortName,
  toBadgeSafeEmployee,
  toPublicEmployeeIdentity,
  updatePayrollEmployee,
} from "@/lib/data/payroll-employees";
import { findPayrollEmployeeById } from "@/lib/hr/payroll-lookup";
import { isExpatEmployee } from "@/lib/hr/payroll-utils";
import { notifyIntegration } from "@/lib/integrations";

/**
 * Badge-safe identity PATCH (short_name) for QC badges and admin.
 * Never returns salary / bank fields.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireFactoryOpsAccess();
    if (!session) {
      return NextResponse.json({ error: "Factory access required." }, { status: 403 });
    }

    if (!session.isAdmin && !session.isClientManager) {
      return NextResponse.json(
        { error: "Only QC or admin can update badge short name." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    await ensureDocumentsLoaded(["payroll_employees"]);

    const existing = findPayrollEmployeeById(id);
    if (!existing) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }

    if (session.isClientManager && !session.isAdmin && !isExpatEmployee(existing)) {
      return NextResponse.json(
        { error: "QC can only update short name for Expat employees." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as { short_name?: string | null };
    if (body.short_name === undefined) {
      return NextResponse.json({ error: "short_name is required." }, { status: 400 });
    }

    const short_name = normalizeShortName(body.short_name);
    const employee = await updatePayrollEmployee(id, { short_name });
    const safe = toBadgeSafeEmployee(employee);
    const publicEmployee = toPublicEmployeeIdentity(employee);

    await notifyIntegration("employee.updated", {
      id: publicEmployee.id,
      employee_id_number: publicEmployee.employee_id_number,
      full_name: publicEmployee.full_name,
      short_name: publicEmployee.short_name,
      badge_group: publicEmployee.badge_group,
      updated_by: session.email,
    });

    return NextResponse.json({ ok: true, employee: safe });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update employee.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
