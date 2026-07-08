import type { FabricLineReceiveStatus, FabricReceipt } from "@/lib/types/fabric-receipts";
import type { ProductionWorkOrder } from "@/lib/types/production";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

/** Lines still on the receiving floor (Receive → wash/soak → iron). */
export const FABRIC_RECEIVING_FLOOR_STATUSES: ReadonlySet<FabricLineReceiveStatus> = new Set([
  "pending",
  "received",
  "fabric_prep",
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
