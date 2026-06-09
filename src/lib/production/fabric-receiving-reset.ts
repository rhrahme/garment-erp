import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { removeFabricReceiptsForLineIds } from "@/lib/data/fabric-receipts";
import { removeProductionWorkOrdersForLineIds } from "@/lib/data/production-work-orders";
import { readSalesOrders, writeSalesOrders } from "@/lib/data/sales-orders";
import { notifyIntegration } from "@/lib/integrations";
import { clearFabricLinePrintTimestamps } from "@/lib/sales-orders/fabric-lines";
import type { SalesOrder } from "@/lib/types/sales-orders";

export type FabricReceivingTestingResetInput = {
  sales_order_id: string;
  sales_order_line_ids?: string[];
  clear_print_timestamps?: boolean;
};

export type FabricReceivingTestingResetResult = {
  sales_order_id: string;
  so_number: string;
  reset_line_ids: string[];
  removed_receipt_ids: string[];
  removed_work_order_ids: string[];
  cleared_print_line_ids: string[];
};

function resolveResetLineIds(order: SalesOrder, lineIds?: string[]): string[] {
  const orderLineIds = new Set(order.fabric_lines.map((line) => line.id));

  if (lineIds && lineIds.length > 0) {
    const unknown = lineIds.filter((lineId) => !orderLineIds.has(lineId));
    if (unknown.length > 0) {
      throw new Error("One or more fabric lines do not belong to this sales order.");
    }
    return lineIds;
  }

  return order.fabric_lines.map((line) => line.id);
}

export async function resetFabricReceivingForTesting(
  input: FabricReceivingTestingResetInput,
  source: "erp" | "api" = "erp"
): Promise<FabricReceivingTestingResetResult> {
  await ensureDocumentsLoaded(["sales_orders", "fabric_receipts", "production_work_orders"]);

  const salesOrderId = input.sales_order_id.trim();
  if (!salesOrderId) {
    throw new Error("Select a sales order to reset.");
  }

  const store = readSalesOrders();
  const orderIndex = store.orders.findIndex((order) => order.id === salesOrderId);
  if (orderIndex < 0) {
    throw new Error("Sales order not found.");
  }

  const order = store.orders[orderIndex]!;
  if (order.fabric_lines.length === 0) {
    throw new Error("This sales order has no fabric lines.");
  }

  const resetLineIds = resolveResetLineIds(order, input.sales_order_line_ids);
  if (resetLineIds.length === 0) {
    throw new Error("No fabric lines selected to reset.");
  }

  const removedReceiptIds = await removeFabricReceiptsForLineIds(resetLineIds);
  const removedWorkOrderIds = await removeProductionWorkOrdersForLineIds(resetLineIds);

  let clearedPrintLineIds: string[] = [];
  if (input.clear_print_timestamps !== false) {
    const { lines, cleared_line_ids } = clearFabricLinePrintTimestamps(order.fabric_lines, resetLineIds);
    clearedPrintLineIds = cleared_line_ids;
    if (clearedPrintLineIds.length > 0) {
      store.orders[orderIndex] = { ...order, fabric_lines: lines };
      await writeSalesOrders(store);
    }
  }

  const result: FabricReceivingTestingResetResult = {
    sales_order_id: order.id,
    so_number: order.so_number,
    reset_line_ids: resetLineIds,
    removed_receipt_ids: removedReceiptIds,
    removed_work_order_ids: removedWorkOrderIds,
    cleared_print_line_ids: clearedPrintLineIds,
  };

  await notifyIntegration(
    "fabric_receiving.testing_reset",
    {
      sales_order_id: result.sales_order_id,
      so_number: result.so_number,
      reset_line_ids: result.reset_line_ids,
      removed_receipt_count: result.removed_receipt_ids.length,
      removed_work_order_count: result.removed_work_order_ids.length,
      cleared_print_line_ids: result.cleared_print_line_ids,
    },
    source
  );

  return result;
}
