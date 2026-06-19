import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { findPayrollEmployeeByBadgeValue, employeeNeedsWorkstationPick } from "@/lib/hr/payroll-lookup";

export async function POST(request: Request) {
  try {
    await ensureDocumentsLoaded(["payroll_employees"]);
    const body = (await request.json()) as { code?: string };
    const code = String(body.code ?? "").trim();

    if (!code) {
      return NextResponse.json({ error: "Badge code is required." }, { status: 400 });
    }

    const employee = findPayrollEmployeeByBadgeValue(code);

    if (!employee) {
      return NextResponse.json({ error: "Employee badge not recognized — check HR register." }, { status: 404 });
    }
    if (!employee.is_active) {
      return NextResponse.json({ error: "Employee is inactive — contact HR." }, { status: 403 });
    }

    return NextResponse.json({
      employee: {
        id: employee.id,
        employee_id_number: employee.employee_id_number,
        full_name: employee.full_name,
        assigned_workstation_id: employee.assigned_workstation_id ?? null,
        is_mobile_floater: Boolean(employee.is_mobile_floater),
        needs_workstation_pick: employeeNeedsWorkstationPick(employee),
      },
    });
  } catch (error) {
    console.error("Employee lookup failed:", error);
    return NextResponse.json({ error: "Employee lookup failed." }, { status: 500 });
  }
}
