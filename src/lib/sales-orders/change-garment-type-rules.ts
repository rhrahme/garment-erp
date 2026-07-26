import type { SessionContext } from "@/lib/auth/session";
import { isGarmentStitchType } from "@/lib/sales-orders/garment-types";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export function canChangeGarmentType(
  session: Pick<
    SessionContext,
    "isAdmin" | "isClientManager" | "isPatternOperator" | "isProductionOperator"
  >
): boolean {
  return (
    session.isAdmin ||
    session.isClientManager ||
    session.isPatternOperator ||
    session.isProductionOperator
  );
}

function isBespokeActiveOrder(order: Pick<SalesOrder, "status" | "retail_brand">): boolean {
  if (order.retail_brand?.trim()) return false;
  return order.status === "open" || order.status === "fabric_pos_created";
}

export function garmentTypeChangeBlockedReason(
  order: Pick<SalesOrder, "status" | "retail_brand">,
  line: Pick<SalesOrderFabricLine, "garment_type">,
  nextGarmentType: string
): string | null {
  if (!isBespokeActiveOrder(order)) {
    if (order.retail_brand?.trim()) {
      return "Ready-made retail orders cannot have garment types changed.";
    }
    return "This order is closed — garment type can only be changed while the order is open.";
  }
  if (!nextGarmentType.trim()) {
    return "Select a garment type.";
  }
  if (!isGarmentStitchType(nextGarmentType)) {
    return `Invalid garment type: ${nextGarmentType}`;
  }
  if (line.garment_type === nextGarmentType) {
    return "Garment type is already set to that value.";
  }
  return null;
}
