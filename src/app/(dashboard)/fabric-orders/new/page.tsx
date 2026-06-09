import { PageHeader } from "@/components/ui/PageHeader";
import { SalesOrderForm } from "@/components/orders/SalesOrderForm";
import { getSessionContext } from "@/lib/auth/session";
import { fabricOrderUiLabels } from "@/lib/orders/fabric-order-ui-labels";

export default async function NewFabricOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ duplicate_from?: string; fresh?: string; continue?: string }>;
}) {
  const session = await getSessionContext();
  const labels = fabricOrderUiLabels(session.isClientManager);
  const { duplicate_from: duplicateFromOrderId, fresh, continue: continueDraft } = await searchParams;
  const isDuplicate = Boolean(duplicateFromOrderId?.trim());

  return (
    <div>
      <PageHeader
        title={isDuplicate ? "Duplicate fabric order for another client" : labels.newTitle}
        description={labels.newDescription}
      />
      <SalesOrderForm
        duplicateFromOrderId={duplicateFromOrderId?.trim() || undefined}
        startFresh={fresh === "1"}
        continueDraft={continueDraft === "1"}
        productionMode={session.isClientManager}
        redirectBasePath="/fabric-orders"
      />
    </div>
  );
}
