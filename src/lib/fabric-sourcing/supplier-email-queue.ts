import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { listStoredFabricOrdersFresh } from "@/lib/integrations/fabric-order-store";
import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";

export type SupplierEmailQueueItem = PurchaseOrder & {
  so_number: string | null;
  client_code: string | null;
  delivery_destination: DeliveryDestination | null;
};

export type SupplierEmailBatch = {
  /** Stable key for React lists — supplier + pending/sent grouping. */
  id: string;
  supplier_id: string;
  supplier_name: string;
  orders: SupplierEmailQueueItem[];
  /** True when this card combines POs from more than one sales order. */
  combines_multiple_orders: boolean;
  /** Total fabric lines across all POs in the batch. */
  fabric_line_count: number;
  emailed_at: string | null;
  is_pending: boolean;
};

export async function listSupplierEmailQueue(
  salesOrderId?: string | null
): Promise<SupplierEmailQueueItem[]> {
  // Both documents are Supabase-backed; warm them so a cold serverless instance
  // doesn't fall back to the empty local JSON (which renders an empty page even
  // though the sales order shows "Supplier emailed").
  await ensureDocumentsLoaded(["sales_orders", "fabric_orders"]);

  const salesById = new Map(readSalesOrders().orders.map((order) => [order.id, order]));

  return (await listStoredFabricOrdersFresh())
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

function batchGroupKey(order: SupplierEmailQueueItem, consolidate: boolean): string {
  if (!consolidate) {
    return order.id;
  }
  if (!order.emailed_at) {
    return `pending:${order.supplier_id}`;
  }
  return `sent:${order.supplier_id}:${order.emailed_at}`;
}

export function groupSupplierEmailBatches(
  orders: SupplierEmailQueueItem[],
  options?: { consolidate?: boolean }
): SupplierEmailBatch[] {
  const consolidate = options?.consolidate ?? true;
  const groups = new Map<string, SupplierEmailQueueItem[]>();

  for (const order of orders) {
    const key = batchGroupKey(order, consolidate);
    const bucket = groups.get(key) ?? [];
    bucket.push(order);
    groups.set(key, bucket);
  }

  const batches: SupplierEmailBatch[] = [];

  for (const [key, batchOrders] of groups) {
    const sorted = [...batchOrders].sort((a, b) => a.order_date.localeCompare(b.order_date));
    const salesOrderIds = new Set(sorted.map((order) => order.sales_order_id).filter(Boolean));
    const fabricLineCount = sorted.reduce((sum, order) => sum + (order.lines?.length ?? 0), 0);
    const emailedAt = sorted.every((order) => order.emailed_at)
      ? sorted.map((order) => order.emailed_at!).sort().at(-1) ?? null
      : sorted.some((order) => order.emailed_at)
        ? sorted.find((order) => order.emailed_at)?.emailed_at ?? null
        : null;

    batches.push({
      id: key,
      supplier_id: sorted[0]!.supplier_id,
      supplier_name: sorted[0]!.supplier?.name ?? sorted[0]!.supplier_id,
      orders: sorted,
      combines_multiple_orders: salesOrderIds.size > 1,
      fabric_line_count: fabricLineCount,
      emailed_at: emailedAt,
      is_pending: sorted.some((order) => !order.emailed_at),
    });
  }

  return batches.sort((a, b) => {
    const aPending = a.is_pending ? 0 : 1;
    const bPending = b.is_pending ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    const aDate = a.orders[0]?.order_date ?? "";
    const bDate = b.orders[0]?.order_date ?? "";
    return bDate.localeCompare(aDate);
  });
}

export async function listSupplierEmailBatches(
  salesOrderId?: string | null
): Promise<SupplierEmailBatch[]> {
  const orders = await listSupplierEmailQueue(salesOrderId);
  return groupSupplierEmailBatches(orders, { consolidate: !salesOrderId });
}
