import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { HrNav } from "@/components/hr/HrNav";
import { PayrollWorkspace } from "@/components/hr/PayrollWorkspace";
import { requireAdmin } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getPayrollSummary, readPayrollEmployees } from "@/lib/data/payroll-employees";

export default async function HRPage() {
  const session = await requireAdmin();
  if (!session) {
    redirect("/hr/id-badges");
  }

  await ensureDocumentsLoaded(["payroll_employees"]);
  const payroll = readPayrollEmployees();
  const summary = getPayrollSummary(payroll);

  return (
    <div>
      <PageHeader
        title="HR & Payroll"
        description="Employee salary register — bank details for WPS / payroll transfer"
      />
      <HrNav showPayroll />
      {payroll.employees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          No payroll data yet. Place the salary Excel file at{" "}
          <code className="rounded bg-slate-100 px-1">src/data/hr/salary-details-revised.xlsx</code> and run{" "}
          <code className="rounded bg-slate-100 px-1">python3 scripts/import-salary-xlsx.py</code>.
        </div>
      ) : (
        <PayrollWorkspace
          employees={payroll.employees}
          summary={summary}
          sourceFile={payroll.source_file}
          updatedAt={payroll.updated_at}
        />
      )}
    </div>
  );
}
