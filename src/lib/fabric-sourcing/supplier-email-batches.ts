import {
  resolveFactoryEmailSupplierName,
  supplierEmailBatchKey,
} from "@/lib/fabric-sourcing/supplier-display";
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

function batchGroupKey(order: SupplierEmailQueueItem, consolidate: boolean): string {
  const supplierKey = supplierEmailBatchKey(order.supplier_id);
  if (!consolidate) {
    // One email per supplier per sales order — Solbiati + Loro Piana share the factory inbox.
    const salesOrderKey = order.sales_order_id ?? order.id;
    return `so:${salesOrderKey}:${supplierKey}`;
  }
  if (!order.emailed_at) {
    return `pending:${supplierKey}`;
  }
  return `sent:${supplierKey}:${order.emailed_at}`;
}

function resolveBatchSupplierMetadata(orders: SupplierEmailQueueItem[]): {
  supplier_id: string;
  supplier_name: string;
} {
  return {
    supplier_id: supplierEmailBatchKey(orders[0]!.supplier_id),
    supplier_name: resolveFactoryEmailSupplierName(orders),
  };
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

    const { supplier_id, supplier_name } = resolveBatchSupplierMetadata(sorted);

    batches.push({
      id: key,
      supplier_id,
      supplier_name,
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
