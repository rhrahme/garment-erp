import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPayrollEmployees } from "@/lib/data/payroll-employees";
import { sortPayrollEmployees } from "@/lib/hr/payroll-utils";

export async function GET() {
  try {
    await ensureDocumentsLoaded(["payroll_employees"]);
    const employees = sortPayrollEmployees(
      readPayrollEmployees().employees.filter((employee) => employee.is_active)
    ).map((employee) => ({
      id: employee.id,
      employee_id_number: employee.employee_id_number,
      full_name: employee.full_name,
    }));

    return NextResponse.json({ employees });
  } catch (error) {
    console.error("Failed to load employees:", error);
    return NextResponse.json({ error: "Failed to load employees." }, { status: 500 });
  }
}
