import { PageHeader } from "@/components/ui/PageHeader";
import { EmployeeQrWorkspace } from "@/components/hr/EmployeeQrWorkspace";
import { HrNav } from "@/components/hr/HrNav";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPayrollEmployees } from "@/lib/data/payroll-employees";

export default async function HrIdBadgesPage() {
  await ensureDocumentsLoaded(["payroll_employees"]);
  const payroll = readPayrollEmployees();

  return (
    <div>
      <PageHeader
        title="HR & Payroll"
        description="Employee ID badges — name, ID number, and scannable QR per employee"
      />
      <HrNav />
      {payroll.employees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          No payroll data yet. Place the salary Excel file at{" "}
          <code className="rounded bg-slate-100 px-1">src/data/hr/salary-details-revised.xlsx</code> and run{" "}
          <code className="rounded bg-slate-100 px-1">python3 scripts/import-salary-xlsx.py</code>.
        </div>
      ) : (
        <EmployeeQrWorkspace employees={payroll.employees} />
      )}
    </div>
  );
}
