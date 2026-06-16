import { PageHeader } from "@/components/ui/PageHeader";
import { IdBadgesNav } from "@/components/hr/IdBadgesNav";
import { HrNav } from "@/components/hr/HrNav";

export default function HrIdBadgesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        title="HR & Payroll"
        description="Employee ID badges — name, ID number, and scannable QR per employee"
      />
      <HrNav />
      <IdBadgesNav />
      {children}
    </div>
  );
}
