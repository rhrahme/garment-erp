import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import { findFabricPoLineForSoFabricLine } from "@/lib/sales-orders/line-cross-reference";

type FabricLineOrderGate = Pick<SalesOrder, "status" | "fabric_po_ids" | "retail_brand">;

function isBespokeActiveOrder(order: FabricLineOrderGate): boolean {
  if (order.retail_brand?.trim()) return false;
  return order.status === "open" || order.status === "fabric_pos_created";
}

/** Full edit of every fabric line — only before any supplier PO exists. */
function fabricLinesFullyMutable(order: FabricLineOrderGate): boolean {
  if (!isBespokeActiveOrder(order)) return false;
  if (order.fabric_po_ids.length > 0) return false;
  return order.status === "open";
}

/**
 * QC/admin may append fabrics mid-order even after supplier emails were created,
 * so newly added articles can be ordered separately.
 */
export function canAppendFabricLines(order: FabricLineOrderGate): boolean {
  return isBespokeActiveOrder(order);
}

/** Same gates as full-order edit — open bespoke orders without supplier fabric POs. */
export function canEditFabricLines(order: FabricLineOrderGate): boolean {
  return fabricLinesFullyMutable(order);
}

/** Edit/remove a single line — allowed for unordered lines after POs exist. */
export function canMutateSalesOrderFabricLine(
  order: FabricLineOrderGate,
  line: Pick<SalesOrderFabricLine, "id" | "fabric_number" | "garment_type" | "label_stickers">,
  fabricPos: PurchaseOrder[]
): boolean {
  if (!isBespokeActiveOrder(order)) return false;
  if (canEditFabricLines(order)) return true;
  return !findFabricPoLineForSoFabricLine(line as SalesOrderFabricLine, fabricPos);
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

export function fabricLineMutateBlockedReason(
  order: FabricLineOrderGate,
  line: Pick<SalesOrderFabricLine, "id" | "fabric_number" | "garment_type" | "label_stickers">,
  fabricPos: PurchaseOrder[]
): string | null {
  if (canMutateSalesOrderFabricLine(order, line, fabricPos)) return null;
  if (order.retail_brand?.trim()) {
    return "Ready-made retail orders cannot have fabric lines edited.";
  }
  if (order.status !== "open" && order.status !== "fabric_pos_created") {
    return "This order is closed — fabrics can only be edited while the order is open.";
  }
  return "Cannot edit this fabric — it was already included in a supplier fabric order.";
}
