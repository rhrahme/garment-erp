import { redirect } from "next/navigation";
import { EmployeeQrWorkspace } from "@/components/hr/EmployeeQrWorkspace";
import { getSessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPayrollEmployees, toBadgeSafeEmployee } from "@/lib/data/payroll-employees";
import { filterPayrollEmployeesByGroup } from "@/lib/hr/payroll-utils";
import { CreateEmployeeForm } from "@/components/hr/CreateEmployeeForm";

function EmployeesEmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
        No employees yet. Add an employee to generate an ID badge QR.
      </div>
      {canCreate ? <CreateEmployeeForm defaultGroup="saudi" /> : null}
    </div>
  );
}

export default async function HrIdBadgesSaudisPage() {
  const session = await getSessionContext();
  // QC must not browse Saudi employees -- Expats only.
  if (session.isClientManager) {
    redirect("/hr/id-badges/expats");
  }

  const canCreate = session.isAdmin || session.isProductionOperator;

  await ensureDocumentsLoaded(["payroll_employees"]);
  const payroll = readPayrollEmployees();
  const groupEmployees = filterPayrollEmployeesByGroup(payroll.employees, "saudi");
  // Strip salary / bank after group filter so tabs stay correct without leaking payroll.
  const employees = session.isAdmin
    ? groupEmployees
    : groupEmployees.map(toBadgeSafeEmployee);

  if (payroll.employees.length === 0) {
    return <EmployeesEmptyState canCreate={canCreate} />;
  }

  return (
    <EmployeeQrWorkspace
      employees={employees}
      group="saudi"
      canCreate={canCreate}
    />
  );
}
