import { PageHeader } from "@/components/ui/PageHeader";
import { IdBadgesNav } from "@/components/hr/IdBadgesNav";
import { HrNav } from "@/components/hr/HrNav";
import { getSessionContext } from "@/lib/auth/session";

export default async function HrIdBadgesLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  // Payroll register tab is admin-only; QC and factory managers get badges only.
  const showPayroll = session.isAdmin;
  const badgesOnly = !session.isAdmin;

  return (
    <div>
      <PageHeader
        title={badgesOnly ? "Employees" : "HR & Payroll"}
        description={
          badgesOnly
            ? "Employee list and ID badges - name, ID number, and scannable QR"
            : "Employee ID badges - name, ID number, and scannable QR per employee"
        }
      />
      <HrNav showPayroll={showPayroll} />
      <IdBadgesNav />
      {children}
    </div>
  );
}
