import { EmployeeQrWorkspace } from "@/components/hr/EmployeeQrWorkspace";
import { getSessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPayrollEmployees } from "@/lib/data/payroll-employees";
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
  const canCreate = session.isAdmin || session.isProductionOperator;

  await ensureDocumentsLoaded(["payroll_employees"]);
  const payroll = readPayrollEmployees();

  if (payroll.employees.length === 0) {
    return <EmployeesEmptyState canCreate={canCreate} />;
  }

  return (
    <EmployeeQrWorkspace
      employees={filterPayrollEmployeesByGroup(payroll.employees, "saudi")}
      group="saudi"
      canCreate={canCreate}
    />
  );
}
