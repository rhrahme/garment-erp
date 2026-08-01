import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  normalizeShortName,
  toBadgeSafeEmployee,
  toPublicEmployeeIdentity,
  updatePayrollEmployee,
} from "@/lib/data/payroll-employees";
import { findPayrollEmployeeById } from "@/lib/hr/payroll-lookup";
import { notifyIntegration } from "@/lib/integrations";
import { verifyApiKey } from "@/lib/integrations/api-auth";

/** Zapier/API parity for badge short_name without salary fields. */
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

    const body = (await request.json()) as { short_name?: string | null };
    if (body.short_name === undefined) {
      return NextResponse.json({ error: "short_name is required." }, { status: 400 });
    }

    const short_name = normalizeShortName(body.short_name);
    const employee = await updatePayrollEmployee(id, { short_name });
    const safe = toBadgeSafeEmployee(employee);
    const publicEmployee = toPublicEmployeeIdentity(employee);

    await notifyIntegration(
      "employee.updated",
      {
        id: publicEmployee.id,
        employee_id_number: publicEmployee.employee_id_number,
        full_name: publicEmployee.full_name,
        short_name: publicEmployee.short_name,
        badge_group: publicEmployee.badge_group,
      },
      "api"
    );

    return NextResponse.json({ ok: true, employee: safe });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update employee.";
    const status = message.includes("not found") ? 404 : 500;
    console.error("v1 update employee failed:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
