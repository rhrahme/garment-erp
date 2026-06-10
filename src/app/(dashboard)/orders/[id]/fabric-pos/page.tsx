import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { FabricPosReview } from "@/components/orders/FabricPosReview";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrderById } from "@/lib/data/sales-orders";

export default async function SalesOrderFabricPosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await ensureDocumentsLoaded(["sales_orders"]);
  const order = getSalesOrderById(id);
  if (!order) notFound();

  return (
    <div>
      <PageHeader
        title="Supplier emails"
        description={`${order.so_number} · ${order.client_name} — one email per supplier`}
        action={
          <Link href={`/orders/${id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            ← Back to order
          </Link>
        }
      />
      <FabricPosReview salesOrderId={id} />
    </div>
  );
}
