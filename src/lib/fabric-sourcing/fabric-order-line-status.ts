import type { PurchaseOrder, PurchaseOrderLine } from "@/lib/types/fabric-sourcing";

function hasLineLevelSentMarkers(order: PurchaseOrder): boolean {
  return (order.lines ?? []).some((line) => Boolean(line.emailed_at));
}

/** True when this PO line has been included in a supplier email. */
export function isFabricOrderLineSent(line: PurchaseOrderLine, order: PurchaseOrder): boolean {
  if (line.emailed_at) return true;
  // Legacy POs: whole order marked sent before line-level tracking existed.
  if (order.emailed_at && !hasLineLevelSentMarkers(order)) return true;
  return false;
}

export function getPendingFabricOrderLines(order: PurchaseOrder): PurchaseOrderLine[] {
  return (order.lines ?? []).filter((line) => !isFabricOrderLineSent(line, order));
}

export function isFabricOrderFullySent(order: PurchaseOrder): boolean {
  const lines = order.lines ?? [];
  if (lines.length === 0) return Boolean(order.emailed_at);
  return getPendingFabricOrderLines(order).length === 0;
}

export function isFabricOrderPending(order: PurchaseOrder): boolean {
  return !isFabricOrderFullySent(order);
}

export function countPendingFabricOrderLines(orders: PurchaseOrder[]): number {
  return orders.reduce((sum, order) => sum + getPendingFabricOrderLines(order).length, 0);
}

/** Group selected line ids by PO id — skips empty buckets. */
export function lineIdsByPoIdFromSelection(
  orders: PurchaseOrder[],
  selectedLineIds: Set<string>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const order of orders) {
    const ids = (order.lines ?? [])
      .map((line) => line.id)
      .filter((id) => selectedLineIds.has(id));
    if (ids.length > 0) out[order.id] = ids;
  }
  return out;
}
