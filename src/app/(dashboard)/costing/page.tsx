import { PageHeader } from "@/components/ui/PageHeader";
import { CostingWorkspace } from "@/components/costing/CostingWorkspace";
import { getCostingOverview, redactCostingOverview } from "@/lib/costing/compute";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSessionContext } from "@/lib/auth/session";
import { canViewMoney } from "@/lib/auth/invoice-amounts-access";

export default async function CostingPage() {
  await ensureDocumentsLoaded(["sales_orders", "costing_rates"]);
  const session = await getSessionContext();
  const overview = canViewMoney(session)
    ? getCostingOverview({ includeArchived: true })
    : redactCostingOverview(getCostingOverview({ includeArchived: true }));

  return (
    <div>
      <PageHeader
        title="Costing"
        description="Full cost view per order — click a row to expand fabrics, prices, and make costs. All on this page."
      />
      <CostingWorkspace
        overview={overview}
        canToggleAmounts={session.canToggleInvoiceAmounts}
        amountsVisibleByDefault={session.invoiceAmountsVisibleByDefault}
        revealWithoutPassword={session.canRevealInvoiceAmountsWithoutPassword}
      />
    </div>
  );
}
