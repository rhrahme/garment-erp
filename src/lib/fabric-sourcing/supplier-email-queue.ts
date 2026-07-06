import path from "path";
import {
  ensureDocumentsLoaded,
  invalidateDocumentCache,
} from "@/lib/data/document-persistence";
import { getSalesOrderByIdFresh, readSalesOrders } from "@/lib/data/sales-orders";
import {
  ensureFabricOrdersLoaded,
  listStoredFabricOrdersFresh,
} from "@/lib/integrations/fabric-order-store";
import { isFabricOrderPending } from "@/lib/fabric-sourcing/fabric-order-line-status";
import {
  findMatchingSalesOrderForOrphanPos,
  resolveSupplierEmailMetadata,
} from "@/lib/fabric-sourcing/supplier-email-metadata";
import { reconcileOrphanedFabricPos } from "@/lib/fabric-sourcing/reconcile-orphaned-fabric-pos";
import { getFabricPosForSalesOrder } from "@/lib/sales-orders/line-cross-reference";
import {
  groupSupplierEmailBatches,
  type SupplierEmailBatch,
  type SupplierEmailQueueItem,
} from "@/lib/fabric-sourcing/supplier-email-batches";

export type { SupplierEmailBatch, SupplierEmailQueueItem };
export { groupSupplierEmailBatches };

const FABRIC_ORDERS_PATH = path.join(process.cwd(), "fabric-orders.local.json");

function enrichQueueItem(
  order: SupplierEmailQueueItem,
  salesById: Map<string, ReturnType<typeof readSalesOrders>["orders"][number]>,
  salesOrders: ReturnType<typeof readSalesOrders>["orders"],
  orphanPosByMissingId: Map<string, SupplierEmailQueueItem[]>,
  salesOrderFilter?: ReturnType<typeof readSalesOrders>["orders"][number]
): SupplierEmailQueueItem {
  let salesOrder = order.sales_order_id ? salesById.get(order.sales_order_id) : undefined;

  if (!salesOrder) {
    salesOrder = salesOrders.find((candidate) => candidate.fabric_po_ids?.includes(order.id));
  }

  if (!salesOrder && salesOrderFilter) {
    salesOrder = salesOrderFilter;
  }

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

async function resolveSalesOrderFilter(
  salesOrderId: string | null | undefined,
  salesById: Map<string, ReturnType<typeof readSalesOrders>["orders"][number]>
): Promise<ReturnType<typeof readSalesOrders>["orders"][number] | undefined> {
  if (!salesOrderId) return undefined;

  const cached = salesById.get(salesOrderId);
  if (cached) return cached;

  const fresh = await getSalesOrderByIdFresh(salesOrderId);
  if (fresh) {
    salesById.set(fresh.id, fresh);
  }
  return fresh;
}

async function loadActiveFabricOrders(): Promise<
  Awaited<ReturnType<typeof listStoredFabricOrdersFresh>>
> {
  return (await listStoredFabricOrdersFresh()).filter((order) => order.status !== "cancelled");
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
  const salesOrderFilter = await resolveSalesOrderFilter(salesOrderId, salesById);
  let allFabricOrders = await loadActiveFabricOrders();

  let rawOrders = salesOrderFilter
    ? getFabricPosForSalesOrder(salesOrderFilter, allFabricOrders)
    : allFabricOrders;

  // SO still references PO ids but fabric_orders read was empty/stale — retry once from Supabase.
  if (
    salesOrderFilter &&
    rawOrders.length === 0 &&
    (salesOrderFilter.fabric_po_ids?.length ?? 0) > 0
  ) {
    invalidateDocumentCache(FABRIC_ORDERS_PATH);
    await ensureFabricOrdersLoaded();
    allFabricOrders = await loadActiveFabricOrders();
    rawOrders = getFabricPosForSalesOrder(salesOrderFilter, allFabricOrders);
  }

  const orphanPosByMissingId = new Map<string, SupplierEmailQueueItem[]>();
  for (const order of rawOrders) {
    if (!order.sales_order_id || salesById.has(order.sales_order_id)) continue;
    const bucket = orphanPosByMissingId.get(order.sales_order_id) ?? [];
    bucket.push(order);
    orphanPosByMissingId.set(order.sales_order_id, bucket);
  }

  return rawOrders
    .map((order) =>
      enrichQueueItem(order, salesById, salesStore.orders, orphanPosByMissingId, salesOrderFilter)
    )
    .sort((a, b) => {
      const aPending = isFabricOrderPending(a) ? 0 : 1;
      const bPending = isFabricOrderPending(b) ? 0 : 1;
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
