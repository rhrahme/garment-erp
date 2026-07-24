import { NextResponse } from "next/server";
import { requireFactoryOpsAccess } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  createPayrollEmployee,
  readPayrollEmployees,
  toPublicEmployeeIdentity,
} from "@/lib/data/payroll-employees";
import { sortPayrollEmployees, type IdBadgeGroup } from "@/lib/hr/payroll-utils";
import { notifyIntegration } from "@/lib/integrations";

export async function GET() {
  try {
    const session = await requireFactoryOpsAccess();
    if (!session) {
      return NextResponse.json({ error: "Factory access required." }, { status: 403 });
    }

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

export async function POST(request: Request) {
  try {
    const session = await requireFactoryOpsAccess();
    if (!session) {
      return NextResponse.json({ error: "Factory access required." }, { status: 403 });
    }

    await ensureDocumentsLoaded(["payroll_employees"]);
    const body = (await request.json()) as {
      full_name?: string;
      employee_id_number?: string;
      badge_group?: IdBadgeGroup;
      bank_name?: string;
      assigned_workstation_id?: string | null;
      is_mobile_floater?: boolean;
      salary_amount?: number;
      basic_salary?: number;
      housing_allowance?: number;
      other_earnings?: number;
      deduction?: number;
      account_number?: string;
      payment_description?: string;
      address_1?: string;
      address_2?: string;
      address_3?: string;
    };

    const employee = await createPayrollEmployee({
      full_name: String(body.full_name ?? ""),
      employee_id_number: String(body.employee_id_number ?? ""),
      badge_group: body.badge_group === "expat" ? "expat" : "saudi",
      bank_name: body.bank_name,
      assigned_workstation_id: body.assigned_workstation_id,
      is_mobile_floater: body.is_mobile_floater,
      // Salary/bank account only when an admin creates via this route.
      includePayrollFields: session.isAdmin,
      ...(session.isAdmin
        ? {
            salary_amount: body.salary_amount,
            basic_salary: body.basic_salary,
            housing_allowance: body.housing_allowance,
            other_earnings: body.other_earnings,
            deduction: body.deduction,
            account_number: body.account_number,
            payment_description: body.payment_description,
            address_1: body.address_1,
            address_2: body.address_2,
            address_3: body.address_3,
          }
        : {}),
    });

    const publicEmployee = toPublicEmployeeIdentity(employee);
    await notifyIntegration("employee.created", {
      id: publicEmployee.id,
      employee_id_number: publicEmployee.employee_id_number,
      full_name: publicEmployee.full_name,
      badge_group: publicEmployee.badge_group,
      created_by: session.email,
    });

    return NextResponse.json({ employee: publicEmployee }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create employee.";
    const status =
      message.includes("required") || message.includes("already exists") ? 400 : 500;
    console.error("Failed to create employee:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
