import { PageHeader } from "@/components/ui/PageHeader";
import { IdBadgesNav } from "@/components/hr/IdBadgesNav";
import { HrNav } from "@/components/hr/HrNav";
import { getSessionContext } from "@/lib/auth/session";

export default async function HrIdBadgesLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  const isProduction = session.isProductionOperator;
  const showPayroll = !isProduction;

  return (
    <div>
      <PageHeader
        title={isProduction ? "Employees" : "HR & Payroll"}
        description={
          isProduction
            ? "Employee list and ID badges — name, ID number, and scannable QR"
            : "Employee ID badges — name, ID number, and scannable QR per employee"
        }
      />
      <HrNav showPayroll={showPayroll} />
      <IdBadgesNav />
      {children}
    </div>
  );
}
