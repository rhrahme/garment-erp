import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesOrders, writeSalesOrders } from "@/lib/data/sales-orders";
import {
  cancelStoredFabricOrders,
  ensureFabricOrdersLoaded,
  listStoredFabricOrders,
} from "@/lib/integrations/fabric-order-store";
import { notifyIntegration } from "@/lib/integrations";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";

export async function cancelFabricOrders(ids: string[]): Promise<{
  cancelled: PurchaseOrder[];
  sales_order_ids: string[];
}> {
  const poIds = ids.filter(Boolean);
  if (poIds.length === 0) {
    throw new Error("At least one fabric order id is required.");
  }

  await ensureFabricOrdersLoaded();
  await ensureDocumentsLoaded(["sales_orders", "fabric_orders"]);

  const cancelled = cancelStoredFabricOrders(poIds);
  if (cancelled.length === 0) {
    throw new Error("No pending fabric orders found to cancel.");
  }

  const cancelledIdSet = new Set(cancelled.map((order) => order.id));
  const affectedSalesOrderIds = new Set(
    cancelled.map((order) => order.sales_order_id).filter(Boolean) as string[]
  );

  const store = readSalesOrders();
  const allFabricOrders = listStoredFabricOrders();

  const updatedOrders = store.orders.map((order) => {
    if (!affectedSalesOrderIds.has(order.id)) return order;

    const remainingPoIds = order.fabric_po_ids.filter((id) => !cancelledIdSet.has(id));
    const hasActivePos = remainingPoIds.some((id) => {
      const po = allFabricOrders.find((item) => item.id === id);
      return po && po.status !== "cancelled";
    });

    return {
      ...order,
      fabric_po_ids: remainingPoIds,
      status: hasActivePos ? order.status : ("open" as const),
    };
  });

  await writeSalesOrders({ ...store, orders: updatedOrders });

  await Promise.all(
    cancelled.map((order) =>
      notifyIntegration("fabric_order.cancelled", {
        id: order.id,
        po_number: order.po_number,
        supplier_id: order.supplier_id,
        supplier_name: order.supplier?.name ?? null,
        sales_order_id: order.sales_order_id ?? null,
        batch_size: cancelled.length,
      })
    )
  );

  return {
    cancelled,
    sales_order_ids: [...affectedSalesOrderIds],
  };
}
