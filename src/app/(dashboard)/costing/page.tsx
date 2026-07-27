import { PageHeader } from "@/components/ui/PageHeader";
import { CostingWorkspace } from "@/components/costing/CostingWorkspace";
import { getCostingOverview } from "@/lib/costing/compute";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSessionContext } from "@/lib/auth/session";

export default async function CostingPage() {
  await ensureDocumentsLoaded(["sales_orders", "costing_rates"]);
  const overview = getCostingOverview({ includeArchived: true });
  const session = await getSessionContext();

  return (
    <div>
      <PageHeader
        title="Costing"
        description="Full cost view per order — click a row to expand fabrics, prices, and make costs. All on this page."
      />
      <CostingWorkspace
        overview={overview}
        canToggleAmounts={session.canToggleInvoiceAmounts && session.isAccountingOperator}
        amountsVisibleByDefault={session.invoiceAmountsVisibleByDefault}
        revealWithoutPassword={session.canRevealInvoiceAmountsWithoutPassword}
      />
    </div>
  );
}
