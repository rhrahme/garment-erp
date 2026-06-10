import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { listStoredFabricOrdersFresh } from "@/lib/integrations/fabric-order-store";
import {
  groupSupplierEmailBatches,
  type SupplierEmailBatch,
  type SupplierEmailQueueItem,
} from "@/lib/fabric-sourcing/supplier-email-batches";

export type { SupplierEmailBatch, SupplierEmailQueueItem };
export { groupSupplierEmailBatches };

export async function listSupplierEmailQueue(
  salesOrderId?: string | null
): Promise<SupplierEmailQueueItem[]> {
  // Both documents are Supabase-backed; warm them so a cold serverless instance
  // doesn't fall back to the empty local JSON (which renders an empty page even
  // though the sales order shows "Supplier emailed").
  await ensureDocumentsLoaded(["sales_orders", "fabric_orders"]);

  const salesById = new Map(readSalesOrders().orders.map((order) => [order.id, order]));

  return (await listStoredFabricOrdersFresh())
    .filter((order) => order.status !== "cancelled")
    .filter((order) => !salesOrderId || order.sales_order_id === salesOrderId)
    .map((order) => {
      const salesOrder = order.sales_order_id ? salesById.get(order.sales_order_id) : undefined;
      return {
        ...order,
        so_number: salesOrder?.so_number ?? null,
        client_code: salesOrder?.client_code ?? null,
        delivery_destination: salesOrder?.delivery_destination ?? null,
      };
    })
    .sort((a, b) => {
      const aPending = a.emailed_at ? 1 : 0;
      const bPending = b.emailed_at ? 1 : 0;
      if (aPending !== bPending) return aPending - bPending;
      return b.order_date.localeCompare(a.order_date) * -1;
    });
}

export async function listSupplierEmailBatches(
  salesOrderId?: string | null
): Promise<SupplierEmailBatch[]> {
  const orders = await listSupplierEmailQueue(salesOrderId);
  return groupSupplierEmailBatches(orders, { consolidate: !salesOrderId });
}
