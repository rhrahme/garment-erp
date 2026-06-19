import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { listStoredFabricOrdersFresh } from "@/lib/integrations/fabric-order-store";
import {
  findMatchingSalesOrderForOrphanPos,
  resolveSupplierEmailMetadata,
} from "@/lib/fabric-sourcing/supplier-email-metadata";
import { reconcileOrphanedFabricPos } from "@/lib/fabric-sourcing/reconcile-orphaned-fabric-pos";
import {
  groupSupplierEmailBatches,
  type SupplierEmailBatch,
  type SupplierEmailQueueItem,
} from "@/lib/fabric-sourcing/supplier-email-batches";

export type { SupplierEmailBatch, SupplierEmailQueueItem };
export { groupSupplierEmailBatches };

function enrichQueueItem(
  order: SupplierEmailQueueItem,
  salesById: Map<string, ReturnType<typeof readSalesOrders>["orders"][number]>,
  salesOrders: ReturnType<typeof readSalesOrders>["orders"],
  orphanPosByMissingId: Map<string, SupplierEmailQueueItem[]>
): SupplierEmailQueueItem {
  let salesOrder = order.sales_order_id ? salesById.get(order.sales_order_id) : undefined;

  if (!salesOrder && order.sales_order_id) {
    const orphanGroup = orphanPosByMissingId.get(order.sales_order_id);
    if (orphanGroup) {
      salesOrder = findMatchingSalesOrderForOrphanPos(orphanGroup, salesOrders);
    }
  }

  const metadata = resolveSupplierEmailMetadata(order, salesOrder);
  return {
    ...order,
    ...metadata,
  };
}

export async function listSupplierEmailQueue(
  salesOrderId?: string | null
): Promise<SupplierEmailQueueItem[]> {
  // Both documents are Supabase-backed; warm them so a cold serverless instance
  // doesn't fall back to the empty local JSON (which renders an empty page even
  // though the sales order shows "Supplier emailed").
  await ensureDocumentsLoaded(["sales_orders", "fabric_orders"]);
  await reconcileOrphanedFabricPos();

  const salesStore = readSalesOrders();
  const salesById = new Map(salesStore.orders.map((order) => [order.id, order]));

  const rawOrders = (await listStoredFabricOrdersFresh())
    .filter((order) => order.status !== "cancelled")
    .filter((order) => !salesOrderId || order.sales_order_id === salesOrderId);

  const orphanPosByMissingId = new Map<string, SupplierEmailQueueItem[]>();
  for (const order of rawOrders) {
    if (!order.sales_order_id || salesById.has(order.sales_order_id)) continue;
    const bucket = orphanPosByMissingId.get(order.sales_order_id) ?? [];
    bucket.push(order);
    orphanPosByMissingId.set(order.sales_order_id, bucket);
  }

  return rawOrders
    .map((order) => enrichQueueItem(order, salesById, salesStore.orders, orphanPosByMissingId))
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
