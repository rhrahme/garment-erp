import type { SalesOrder } from "@/lib/types/sales-orders";

type FabricLineOrderGate = Pick<SalesOrder, "status" | "fabric_po_ids" | "retail_brand">;

function fabricLinesMutable(order: FabricLineOrderGate): boolean {
  if (order.retail_brand?.trim()) return false;
  if (order.status !== "open") return false;
  if (order.fabric_po_ids.length > 0) return false;
  return true;
}

/** Client-safe — no filesystem / document persistence imports. */
export function canAppendFabricLines(order: FabricLineOrderGate): boolean {
  return fabricLinesMutable(order);
}

/** Same gates as append — open bespoke orders without supplier fabric POs. */
export function canEditFabricLines(order: FabricLineOrderGate): boolean {
  return fabricLinesMutable(order);
}

export function fabricLineEditBlockedReason(order: FabricLineOrderGate): string | null {
  if (canEditFabricLines(order)) return null;
  if (order.retail_brand?.trim()) {
    return "Ready-made retail orders cannot have fabric lines edited.";
  }
  if (order.fabric_po_ids.length > 0) {
    return "Cannot edit fabrics — supplier fabric orders were already created for this order.";
  }
  return "This order is closed — fabrics can only be edited while the order is open.";
}
