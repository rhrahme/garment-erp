import { listStoredFabricOrders } from "./fabric-order-store";
import { listSupplierReplies } from "./supplier-reply-store";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";

const DEFAULT_FOLLOW_UP_DAYS = 3;

export function getFollowUpOrders(daysSinceSent = DEFAULT_FOLLOW_UP_DAYS): PurchaseOrder[] {
  const cutoff = Date.now() - daysSinceSent * 24 * 60 * 60 * 1000;
  const repliedPoNumbers = new Set(
    listSupplierReplies()
      .map((reply) => reply.po_number)
      .filter(Boolean) as string[]
  );

  return listStoredFabricOrders().filter((order) => {
    if (order.status !== "sent" || !order.emailed_at) return false;
    if (repliedPoNumbers.has(order.po_number)) return false;
    return new Date(order.emailed_at).getTime() <= cutoff;
  });
}
