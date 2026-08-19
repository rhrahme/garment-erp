import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPayrollEmployees } from "@/lib/data/payroll-employees";
import { readSewingSessionsFresh } from "@/lib/data/sewing-sessions";
import { findPayrollEmployeeById } from "@/lib/hr/payroll-lookup";
import {
  emptySewingEmployeeWork,
  parseFloorAttendancePeriod,
  sewingFloorAttendance,
} from "@/lib/production/sewing-floor-dashboard";
import {
  listSewingKioskEmployees,
  sewingEmployeeWorkLookup,
} from "@/lib/production/sewing-session";

export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  try {
    await ensureDocumentsLoaded(["sewing_sessions", "payroll_employees", "clients", "sales_orders"]);
    const store = readSewingSessionsFresh();
    const payroll = readPayrollEmployees().employees;
    const employeeKey = request.nextUrl.searchParams.get("employee_id")?.trim() ?? "";
    const period = parseFloorAttendancePeriod(request.nextUrl.searchParams.get("period"));
    const attendance = sewingFloorAttendance(store, payroll, period);
    const employees = listSewingKioskEmployees(store);
    if (!employeeKey) {
      return NextResponse.json({ employees, attendance });
    }
    const work =
      sewingEmployeeWorkLookup(store, employeeKey) ??
      (() => {
        const payrollRow = findPayrollEmployeeById(employeeKey);
        return payrollRow ? emptySewingEmployeeWork(payrollRow) : null;
      })();
    if (!work) {
      return NextResponse.json(
        { error: "Employee not found on the stitch kiosk.", employees, attendance },
        { status: 404 }
      );
    }
    return NextResponse.json({ employees, attendance, work });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load employee work.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
