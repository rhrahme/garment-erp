import { NextResponse } from "next/server";
import {
  createPayrollEmployee,
  toPublicEmployeeIdentity,
} from "@/lib/data/payroll-employees";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { notifyIntegration } from "@/lib/integrations";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import type { IdBadgeGroup } from "@/lib/hr/payroll-utils";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureDocumentsLoaded(["payroll_employees"]);
    const body = (await request.json()) as {
      full_name?: string;
      employee_id_number?: string;
      badge_group?: IdBadgeGroup;
      bank_name?: string;
      assigned_workstation_id?: string | null;
      is_mobile_floater?: boolean;
    };

    const employee = await createPayrollEmployee({
      full_name: String(body.full_name ?? ""),
      employee_id_number: String(body.employee_id_number ?? ""),
      badge_group: body.badge_group === "expat" ? "expat" : "saudi",
      bank_name: body.bank_name,
      assigned_workstation_id: body.assigned_workstation_id,
      is_mobile_floater: body.is_mobile_floater,
      includePayrollFields: false,
    });

    const publicEmployee = toPublicEmployeeIdentity(employee);
    await notifyIntegration(
      "employee.created",
      {
        id: publicEmployee.id,
        employee_id_number: publicEmployee.employee_id_number,
        full_name: publicEmployee.full_name,
        badge_group: publicEmployee.badge_group,
      },
      "api"
    );

    return NextResponse.json({ employee: publicEmployee }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create employee.";
    const status =
      message.includes("required") || message.includes("already exists") ? 400 : 500;
    console.error("v1 create employee failed:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
