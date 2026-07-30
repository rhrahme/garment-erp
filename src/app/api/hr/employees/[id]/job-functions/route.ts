import { NextResponse } from "next/server";
import { requireFactoryOpsAccess } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { toBadgeSafeEmployee, updatePayrollEmployee } from "@/lib/data/payroll-employees";
import { normalizeJobFunctions } from "@/lib/hr/job-functions";
import { findPayrollEmployeeById } from "@/lib/hr/payroll-lookup";
import { isExpatEmployee } from "@/lib/hr/payroll-utils";
import { notifyIntegration } from "@/lib/integrations";

/**
 * Narrow job-functions PATCH for QC badges (and admin convenience).
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

    // Production operators use badges for QR only -- job roles are QC/admin.
    if (!session.isAdmin && !session.isClientManager) {
      return NextResponse.json(
        { error: "Only QC or admin can update job tasks." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    await ensureDocumentsLoaded(["payroll_employees"]);

    const existing = findPayrollEmployeeById(id);
    if (!existing) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }

    // QC may only assign roles on Expat employees.
    if (session.isClientManager && !session.isAdmin && !isExpatEmployee(existing)) {
      return NextResponse.json(
        { error: "QC can only update job tasks for Expat employees." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as { job_functions?: unknown };
    if (body.job_functions === undefined) {
      return NextResponse.json({ error: "job_functions is required." }, { status: 400 });
    }

    const job_functions = normalizeJobFunctions(body.job_functions);
    const employee = await updatePayrollEmployee(id, { job_functions });
    const safe = toBadgeSafeEmployee(employee);

    await notifyIntegration("employee.job_functions_updated", {
      id: safe.id,
      employee_id_number: safe.employee_id_number,
      full_name: safe.full_name,
      job_functions: safe.job_functions ?? [],
      updated_by: session.email,
    });

    return NextResponse.json({ ok: true, employee: safe });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update job tasks.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
