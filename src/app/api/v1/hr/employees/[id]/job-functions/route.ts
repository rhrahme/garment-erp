import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { toBadgeSafeEmployee, updatePayrollEmployee } from "@/lib/data/payroll-employees";
import { normalizeJobFunctions } from "@/lib/hr/job-functions";
import { findPayrollEmployeeById } from "@/lib/hr/payroll-lookup";
import { notifyIntegration } from "@/lib/integrations";
import { verifyApiKey } from "@/lib/integrations/api-auth";

/** Zapier/API parity for assigning employee job tasks without salary fields. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    await ensureDocumentsLoaded(["payroll_employees"]);

    const existing = findPayrollEmployeeById(id);
    if (!existing) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }

    const body = (await request.json()) as { job_functions?: unknown };
    if (body.job_functions === undefined) {
      return NextResponse.json({ error: "job_functions is required." }, { status: 400 });
    }

    const job_functions = normalizeJobFunctions(body.job_functions);
    const employee = await updatePayrollEmployee(id, { job_functions });
    const safe = toBadgeSafeEmployee(employee);

    await notifyIntegration(
      "employee.job_functions_updated",
      {
        id: safe.id,
        employee_id_number: safe.employee_id_number,
        full_name: safe.full_name,
        job_functions: safe.job_functions ?? [],
      },
      "api"
    );

    return NextResponse.json({ ok: true, employee: safe });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update job tasks.";
    const status = message.includes("not found") ? 404 : 500;
    console.error("v1 update employee job functions failed:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
