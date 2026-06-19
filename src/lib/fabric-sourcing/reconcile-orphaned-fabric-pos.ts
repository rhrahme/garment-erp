import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { buildClientReference, readSalesOrders, writeSalesOrders } from "@/lib/data/sales-orders";
import { findMatchingSalesOrderForOrphanPos } from "@/lib/fabric-sourcing/supplier-email-metadata";
import {
  ensureFabricOrdersLoaded,
  listStoredFabricOrders,
  updateStoredFabricOrders,
} from "@/lib/integrations/fabric-order-store";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";

function groupOrphanPosBySalesOrderId(orders: PurchaseOrder[]): Map<string, PurchaseOrder[]> {
  const salesById = new Map(readSalesOrders().orders.map((order) => [order.id, order]));
  const groups = new Map<string, PurchaseOrder[]>();

  for (const order of orders) {
    if (!order.sales_order_id || order.status === "cancelled") continue;
    if (salesById.has(order.sales_order_id)) continue;

    const bucket = groups.get(order.sales_order_id) ?? [];
    bucket.push(order);
    groups.set(order.sales_order_id, bucket);
  }

  return groups;
}

/**
 * Relink fabric POs whose sales_order_id no longer exists to a matching open order.
 * Only runs when the combined PO fabric lines exactly match an unlinked sales order.
 */
export async function reconcileOrphanedFabricPos(): Promise<boolean> {
  await Promise.all([ensureDocumentsLoaded(["sales_orders"]), ensureFabricOrdersLoaded()]);

  const salesStore = readSalesOrders();
  const fabricOrders = listStoredFabricOrders();
  const orphanGroups = groupOrphanPosBySalesOrderId(fabricOrders);
  if (orphanGroups.size === 0) return false;

  const relinks: Array<{ poIds: string[]; salesOrderId: string; clientReference: string }> = [];

  for (const pos of orphanGroups.values()) {
    const match = findMatchingSalesOrderForOrphanPos(pos, salesStore.orders);
    if (!match) continue;

    relinks.push({
      poIds: pos.map((order) => order.id),
      salesOrderId: match.id,
      clientReference: buildClientReference(match.client_code, match.so_number),
    });
  }

  if (relinks.length === 0) return false;

  updateStoredFabricOrders((orders) => {
    for (const relink of relinks) {
      for (const order of orders) {
        if (!relink.poIds.includes(order.id)) continue;
        order.sales_order_id = relink.salesOrderId;
        order.client_reference = relink.clientReference;
      }
    }
    return orders;
  });

  for (const relink of relinks) {
    const orderIndex = salesStore.orders.findIndex((order) => order.id === relink.salesOrderId);
    if (orderIndex < 0) continue;

    const match = salesStore.orders[orderIndex]!;
    salesStore.orders[orderIndex] = {
      ...match,
      client_reference: relink.clientReference,
      status: "fabric_pos_created",
      fabric_po_ids: [...new Set([...match.fabric_po_ids, ...relink.poIds])],
    };
  }

  await writeSalesOrders(salesStore);
  return true;
}
