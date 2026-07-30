import { PageHeader } from "@/components/ui/PageHeader";
import { IdBadgesNav } from "@/components/hr/IdBadgesNav";
import { HrNav } from "@/components/hr/HrNav";
import { getSessionContext } from "@/lib/auth/session";

export default async function HrIdBadgesLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  // Payroll register tab is admin-only; QC and factory managers get badges only.
  const showPayroll = session.isAdmin;
  const badgesOnly = !session.isAdmin;
  // QC manages Expats only -- hide Saudis tab entirely.
  const showSaudis = !session.isClientManager;

  return (
    <div>
      <PageHeader
        title={badgesOnly ? "Employees" : "HR & Payroll"}
        description={
          badgesOnly
            ? session.isClientManager
              ? "Expat employee list and ID badges - name, ID number, job tasks, and scannable QR"
              : "Employee list and ID badges - name, ID number, and scannable QR"
            : "Employee ID badges - name, ID number, and scannable QR per employee"
        }
      />
      <HrNav showPayroll={showPayroll} />
      <IdBadgesNav showSaudis={showSaudis} />
      {children}
    </div>
  );
}
