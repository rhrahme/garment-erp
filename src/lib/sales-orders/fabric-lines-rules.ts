import type { SalesOrder } from "@/lib/types/sales-orders";

/** Client-safe — no filesystem / document persistence imports. */
export function canAppendFabricLines(
  order: Pick<SalesOrder, "status" | "fabric_po_ids" | "retail_brand">
): boolean {
  if (order.retail_brand?.trim()) return false;
  if (order.status !== "open") return false;
  if (order.fabric_po_ids.length > 0) return false;
  return true;
}
