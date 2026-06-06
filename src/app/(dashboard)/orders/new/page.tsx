import { PageHeader } from "@/components/ui/PageHeader";
import { SalesOrderForm } from "@/components/orders/SalesOrderForm";

export default async function NewSalesOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ duplicate_from?: string; fresh?: string; continue?: string }>;
}) {
  const { duplicate_from: duplicateFromOrderId, fresh, continue: continueDraft } = await searchParams;
  const isDuplicate = Boolean(duplicateFromOrderId?.trim());

  return (
    <div>
      <PageHeader
        title={isDuplicate ? "Duplicate order for another client" : "New Sales Order"}
        description={
          isDuplicate
            ? "Same fabrics and articles as the source order — pick the new client and adjust meters or lines before saving."
            : "Select a client, add fabrics — use client tabs to copy the same articles for another client with different meters."
        }
      />
      <SalesOrderForm
        duplicateFromOrderId={duplicateFromOrderId?.trim() || undefined}
        startFresh={fresh === "1"}
        continueDraft={continueDraft === "1"}
      />
    </div>
  );
}
