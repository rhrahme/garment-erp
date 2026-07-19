import type { FabricReceipt } from "@/lib/types/fabric-receipts";
import type { ProductionWorkOrder } from "@/lib/types/production";
import type { SalesOrder } from "@/lib/types/sales-orders";
import type { SalesMilestone, SalesMilestoneOverride } from "@/lib/types/sales-workspace";

export const SALES_MILESTONES: SalesMilestone[] = [
  "fabric_requested",
  "fabric_ordered",
  "fabric_received",
  "in_production",
  "finishing",
  "ironing",
  "ready_for_fitting",
  "ready_for_delivery",
  "delivered",
];

const MILESTONE_INDEX = new Map(SALES_MILESTONES.map((milestone, index) => [milestone, index]));

function laterMilestone(a: SalesMilestone, b: SalesMilestone): SalesMilestone {
  return (MILESTONE_INDEX.get(b) ?? 0) > (MILESTONE_INDEX.get(a) ?? 0) ? b : a;
}

export function deriveSalesMilestone(
  order: SalesOrder,
  receipts: FabricReceipt[],
  workOrders: ProductionWorkOrder[],
  override?: SalesMilestoneOverride
): SalesMilestone {
  let milestone: SalesMilestone = "fabric_requested";
  if (order.fabric_po_ids.length > 0) milestone = "fabric_ordered";

  const orderReceipts = receipts.filter((receipt) => receipt.sales_order_id === order.id);
  if (orderReceipts.length > 0) milestone = "fabric_received";

  const production = workOrders.filter((workOrder) => workOrder.sales_order_id === order.id);
  if (production.length > 0) milestone = "in_production";
  if (production.some((workOrder) => workOrder.status === "finishing")) milestone = "finishing";
  if (production.some((workOrder) => workOrder.status === "packed")) milestone = "ironing";
  if (
    production.length > 0 &&
    production.every((workOrder) => workOrder.status === "completed")
  ) {
    milestone = "ready_for_delivery";
  }

  if (override) milestone = laterMilestone(milestone, override.milestone);
  return milestone;
}

export function isSalesAttentionMilestone(milestone: SalesMilestone): boolean {
  return milestone === "finishing" || milestone === "ironing";
}
