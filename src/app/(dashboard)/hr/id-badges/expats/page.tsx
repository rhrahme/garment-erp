import { EmployeeQrWorkspace } from "@/components/hr/EmployeeQrWorkspace";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPayrollEmployees } from "@/lib/data/payroll-employees";
import { filterPayrollEmployeesByGroup } from "@/lib/hr/payroll-utils";

function PayrollEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
      No payroll data yet. Place the salary Excel file at{" "}
      <code className="rounded bg-slate-100 px-1">src/data/hr/salary-details-revised.xlsx</code> and run{" "}
      <code className="rounded bg-slate-100 px-1">python3 scripts/import-salary-xlsx.py</code>.
    </div>
  );
}

export default async function HrIdBadgesExpatsPage() {
  await ensureDocumentsLoaded(["payroll_employees"]);
  const payroll = readPayrollEmployees();

  if (payroll.employees.length === 0) {
    return <PayrollEmptyState />;
  }

  return <EmployeeQrWorkspace employees={filterPayrollEmployeesByGroup(payroll.employees, "expat")} group="expat" />;
}
