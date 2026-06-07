import { PageHeader } from "@/components/ui/PageHeader";
import { SalesOrderForm } from "@/components/orders/SalesOrderForm";
import { getSessionContext } from "@/lib/auth/session";
import { ordersUiLabels } from "@/lib/orders/ui-labels";

export default async function NewSalesOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ duplicate_from?: string; fresh?: string; continue?: string }>;
}) {
  const session = await getSessionContext();
  const productionMode = session.isClientManager;
  const labels = ordersUiLabels(productionMode);
  const { duplicate_from: duplicateFromOrderId, fresh, continue: continueDraft } = await searchParams;
  const isDuplicate = Boolean(duplicateFromOrderId?.trim());

  return (
    <div>
      <PageHeader
        title={isDuplicate ? labels.duplicateTitle : labels.newTitle}
        description={isDuplicate ? labels.newDescription : labels.newDescription}
      />
      <SalesOrderForm
        duplicateFromOrderId={duplicateFromOrderId?.trim() || undefined}
        startFresh={fresh === "1"}
        continueDraft={continueDraft === "1"}
        productionMode={productionMode}
      />
    </div>
  );
}
