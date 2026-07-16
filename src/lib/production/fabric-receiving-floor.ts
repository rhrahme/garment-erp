import type { FabricLineReceiveStatus, FabricReceipt } from "@/lib/types/fabric-receipts";
import type { ProductionWorkOrder } from "@/lib/types/production";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

/** Lines still on the receiving floor (Receive → wash/soak → iron). */
export const FABRIC_RECEIVING_FLOOR_STATUSES: ReadonlySet<FabricLineReceiveStatus> = new Set([
  "pending",
  "received",
  "fabric_prep",
]);

/** Production stages that mean the piece is past Fabric Receiving and at/after stitch. */
const STITCHED_OR_DONE_STAGES = new Set([
  "sewing",
  "washing",
  "finishing",
  "packed",
  "completed",
]);

/** Production work orders trump stale receipts — a line in cutting+ is no longer on receiving. */
export function resolveFabricLineReceiveStatus(
  receipt: FabricReceipt | undefined,
  lineWorkOrders: ProductionWorkOrder[]
): FabricLineReceiveStatus {
  if (lineWorkOrders.length > 0) return "handed_off";
  if (receipt) {
    if (receipt.status === "handed_off") return "handed_off";
    return receipt.status;
  }
  return "pending";
}

/** Whether every production piece on the line is completed (Production "Completed" tab). */
export function isLineProductionCompleted(lineWorkOrders: ProductionWorkOrder[]): boolean {
  return lineWorkOrders.length > 0 && lineWorkOrders.every((wo) => wo.status === "completed");
}

/**
 * Whether every production piece on the line has reached sewing or later
 * ("stitched" / done enough that Fabric Receiving should not treat it as outstanding).
 */
export function isLineStitchedOrDone(lineWorkOrders: ProductionWorkOrder[]): boolean {
  return (
    lineWorkOrders.length > 0 &&
    lineWorkOrders.every((wo) => STITCHED_OR_DONE_STAGES.has(wo.status))
  );
}

/** Whether a line belongs on the Fabric Receiving work list (not production floor / history). */
export function isFabricReceivingFloorLine(
  status: FabricLineReceiveStatus,
  order: Pick<SalesOrder, "status">,
  line: Pick<SalesOrderFabricLine, "a4_printed_at" | "prep_stickers_printed_at">
): boolean {
  if (!FABRIC_RECEIVING_FLOOR_STATUSES.has(status)) return false;
  if (status === "received" || status === "fabric_prep") return true;
  if (order.status === "fabric_pos_created") return true;
  if (line.a4_printed_at || line.prep_stickers_printed_at) return true;
  return false;
}

/**
 * Order-level "done" for Fabric Receiving Active — matches Production Completed:
 * every fabric line is past the receiving floor, and any production work is finished
 * (stitched/completed). Partial stitch on some garments must NOT hide siblings that
 * still need receive/wash.
 */
export function isSalesOrderFabricReceivingSettled(
  order: Pick<SalesOrder, "status" | "fabric_lines">,
  lineStatuses: Map<string, FabricLineReceiveStatus>,
  orderWorkOrders: ProductionWorkOrder[]
): boolean {
  if (order.status === "complete" || order.status === "cancelled" || order.status === "delivered") {
    return true;
  }
  if (order.fabric_lines.length === 0) return true;

  for (const line of order.fabric_lines) {
    const status = lineStatuses.get(line.id) ?? "pending";
    if (isFabricReceivingFloorLine(status, order, line)) return false;
  }

  if (orderWorkOrders.length === 0) return true;
  return orderWorkOrders.every((wo) => STITCHED_OR_DONE_STAGES.has(wo.status));
}
