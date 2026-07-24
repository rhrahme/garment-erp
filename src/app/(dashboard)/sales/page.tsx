import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { SalesWorkspaceDashboard } from "@/components/sales/SalesWorkspaceDashboard";
import { getSessionContext } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const session = await getSessionContext();
  if (session.isProductionOperator) redirect("/production");
  if (!session.isSalesOperator && !session.isAdmin) redirect("/dashboard");

  return (
    <div>
      <PageHeader
        title="Sales workspace"
        description="Clients, fabrics, selling invoices, fittings, and high-level production status"
      />
      <SalesWorkspaceDashboard />
    </div>
  );
}
