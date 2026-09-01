import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { HrNav } from "@/components/hr/HrNav";
import { PayrollAdjustmentsWorkspace } from "@/components/hr/PayrollAdjustmentsWorkspace";
import { requireAdmin } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPayrollAdjustmentsFresh } from "@/lib/data/payroll-adjustments";
import { readPayrollEmployees } from "@/lib/data/payroll-employees";

export default async function HrOvertimePage() {
  const session = await requireAdmin();
  if (!session) {
    redirect("/hr/id-badges");
  }

  await ensureDocumentsLoaded(["payroll_employees", "payroll_adjustments"]);
  const payroll = readPayrollEmployees();
  const store = await readPayrollAdjustmentsFresh();

  return (
    <div>
      <PageHeader
        title="Overtime & deductions"
        description="Build overtime pay and deduct mistakes. Each mistake has a note, amount, and an optional photo."
      />
      <HrNav showPayroll />
      <PayrollAdjustmentsWorkspace employees={payroll.employees} adjustments={store.adjustments} />
    </div>
  );
}
