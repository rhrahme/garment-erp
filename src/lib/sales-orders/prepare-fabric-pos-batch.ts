import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { createFabricPosFromSalesOrder } from "@/lib/sales-orders/create-fabric-pos";
import {
  countAllPendingSupplierBatches,
  getFabricPosBlockReason,
  getTodaysFabricSummary,
} from "@/lib/sales-orders/todays-fabric";
import { notifyIntegration } from "@/lib/integrations";

export type PrepareFabricPosSkipped = {
  order_id: string;
  so_number: string;
  reason: string;
};

export type PrepareFabricPosCreated = {
  order_id: string;
  so_number: string;
  fabric_po_count: number;
  fabric_po_ids: string[];
};

export type PrepareFabricPosBatchResult = {
  created: PrepareFabricPosCreated[];
  skipped: PrepareFabricPosSkipped[];
  pending_supplier_count: number;
};

function resolveTargetOrderIds(orderIds: string[] | undefined): string[] {
  if (orderIds && orderIds.length > 0) {
    return [...new Set(orderIds)];
  }
  return [];
}

export async function prepareFabricPosBatch(
  options: { orderIds?: string[] } = {}
): Promise<PrepareFabricPosBatchResult> {
  await ensureDocumentsLoaded(["sales_orders", "fabric_orders"]);

  let targetIds = resolveTargetOrderIds(options.orderIds);
  if (targetIds.length === 0) {
    const summary = await getTodaysFabricSummary();
    targetIds = summary.orders.filter((row) => row.can_create_pos).map((row) => row.id);
  }

  const store = readSalesOrders();
  const ordersById = new Map(store.orders.map((order) => [order.id, order]));

  const created: PrepareFabricPosCreated[] = [];
  const skipped: PrepareFabricPosSkipped[] = [];

  for (const orderId of targetIds) {
    const order = ordersById.get(orderId);
    if (!order) {
      skipped.push({ order_id: orderId, so_number: orderId, reason: "Sales order not found." });
      continue;
    }

    const blockReason = getFabricPosBlockReason(order);
    if (blockReason) {
      skipped.push({ order_id: order.id, so_number: order.so_number, reason: blockReason });
      continue;
    }

    try {
      const result = await createFabricPosFromSalesOrder(order.id);
      created.push({
        order_id: result.order.id,
        so_number: result.order.so_number,
        fabric_po_count: result.fabricOrders.length,
        fabric_po_ids: result.fabricOrders.map((po) => po.id),
      });

      await notifyIntegration("fabric_order.created", {
        sales_order_id: result.order.id,
        so_number: result.order.so_number,
        client_reference: result.order.client_reference,
        fabric_po_count: result.fabricOrders.length,
        fabric_po_ids: result.fabricOrders.map((po) => po.id),
        source: "batch_prepare",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create fabric orders.";
      skipped.push({ order_id: order.id, so_number: order.so_number, reason: message });
    }
  }

  const pending_supplier_count = await countAllPendingSupplierBatches();

  return { created, skipped, pending_supplier_count };
}
