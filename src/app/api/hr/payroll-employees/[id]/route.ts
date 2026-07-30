import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { updatePayrollEmployee } from "@/lib/data/payroll-employees";
import { normalizeJobFunctions } from "@/lib/hr/job-functions";
import { notifyIntegration } from "@/lib/integrations";
import { normalizeWorkstationId } from "@/lib/production/factory-workstations";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { id } = await context.params;
    await ensureDocumentsLoaded(["payroll_employees"]);

    const body = (await request.json()) as {
      assigned_workstation_id?: string | null;
      is_mobile_floater?: boolean;
      job_functions?: unknown;
    };

    const assignedRaw = body.assigned_workstation_id;
    const assigned_workstation_id =
      assignedRaw === null || assignedRaw === ""
        ? null
        : normalizeWorkstationId(String(assignedRaw)) ?? String(assignedRaw).trim().toUpperCase();

    const job_functions =
      body.job_functions !== undefined ? normalizeJobFunctions(body.job_functions) : undefined;

    const employee = await updatePayrollEmployee(id, {
      ...(body.assigned_workstation_id !== undefined ? { assigned_workstation_id } : {}),
      ...(body.is_mobile_floater !== undefined ? { is_mobile_floater: Boolean(body.is_mobile_floater) } : {}),
      ...(job_functions !== undefined ? { job_functions } : {}),
    });

    if (job_functions !== undefined) {
      await notifyIntegration("employee.job_functions_updated", {
        id: employee.id,
        employee_id_number: employee.employee_id_number,
        full_name: employee.full_name,
        job_functions: employee.job_functions ?? [],
        updated_by: session.email,
      });
    }

    return NextResponse.json({ ok: true, employee });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update employee.";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
