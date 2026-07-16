import {
  archiveFabricReceipt,
  mutateFabricReceipts,
  readFabricReceiptsFreshAsync,
} from "@/lib/data/fabric-receipts";
import {
  readProductionWorkOrdersFreshAsync,
  writeProductionWorkOrders,
} from "@/lib/data/production-work-orders";
import { notifyIntegration } from "@/lib/integrations";
import type { FabricReceipt } from "@/lib/types/fabric-receipts";
import type { ProductionWorkOrder } from "@/lib/types/production";

const ACTIVE_RECEIPT_STATUSES = new Set(["received", "fabric_prep"]);

export type SettleFabricReceivingResult = {
  sales_order_id: string;
  so_number: string | null;
  settled_receipt_ids: string[];
  completed_work_order_ids: string[];
};

function markReceiptHandedOff(receipt: FabricReceipt, now: string): void {
  receipt.status = "handed_off";
  receipt.fabric_prep_type = null;
  receipt.fabric_prep_step = null;
  receipt.handed_off_at = receipt.handed_off_at ?? receipt.received_at ?? now;
  receipt.updated_at = now;
}

function completeWorkOrder(workOrder: ProductionWorkOrder, now: string): ProductionWorkOrder {
  if (workOrder.status === "completed") return workOrder;
  return {
    ...workOrder,
    status: "completed",
    fabric_prep_type: null,
    fabric_prep_step: null,
    completed_at: workOrder.completed_at ?? workOrder.received_at ?? now,
    updated_at: now,
  };
}

/**
 * Move leftover Fabric Receiving floor receipts off Active and mark linked
 * production work orders completed. Preserves receipts in the archive document.
 * Used when an SO is marked complete / done so stitched work does not clutter FR.
 */
export async function settleFabricReceivingForSalesOrder(
  salesOrderId: string,
  options?: { source?: "erp" | "api" | "zapier"; so_number?: string | null }
): Promise<SettleFabricReceivingResult> {
  const now = new Date().toISOString();
  const source = options?.source ?? "erp";
  const settledReceipts: FabricReceipt[] = [];

  await mutateFabricReceipts(
    (store) => {
      for (const receipt of store.receipts) {
        if (receipt.sales_order_id !== salesOrderId) continue;
        if (!ACTIVE_RECEIPT_STATUSES.has(receipt.status)) continue;
        markReceiptHandedOff(receipt, now);
        settledReceipts.push({ ...receipt });
      }
    },
    { force: true }
  );

  for (const receipt of settledReceipts) {
    await archiveFabricReceipt(receipt);
  }

  const productionStore = await readProductionWorkOrdersFreshAsync();
  const completedWorkOrderIds: string[] = [];
  let productionChanged = false;
  const nextWorkOrders = productionStore.work_orders.map((workOrder) => {
    if (workOrder.sales_order_id !== salesOrderId) return workOrder;
    if (workOrder.status === "completed") return workOrder;
    productionChanged = true;
    completedWorkOrderIds.push(workOrder.id);
    return completeWorkOrder(workOrder, now);
  });

  if (productionChanged) {
    await writeProductionWorkOrders({ ...productionStore, work_orders: nextWorkOrders });
  }

  const soNumber =
    options?.so_number ??
    settledReceipts[0]?.so_number ??
    productionStore.work_orders.find((wo) => wo.sales_order_id === salesOrderId)?.so_number ??
    null;

  const result: SettleFabricReceivingResult = {
    sales_order_id: salesOrderId,
    so_number: soNumber,
    settled_receipt_ids: settledReceipts.map((receipt) => receipt.id),
    completed_work_order_ids: completedWorkOrderIds,
  };

  if (result.settled_receipt_ids.length > 0 || result.completed_work_order_ids.length > 0) {
    await notifyIntegration(
      "fabric_receiving.settled",
      {
        sales_order_id: result.sales_order_id,
        so_number: result.so_number,
        settled_receipt_count: result.settled_receipt_ids.length,
        settled_receipt_ids: result.settled_receipt_ids,
        completed_work_order_count: result.completed_work_order_ids.length,
        completed_work_order_ids: result.completed_work_order_ids,
      },
      source
    );
  }

  return result;
}

/** True when the sales order still has active received/fabric_prep receipts. */
export async function salesOrderHasActiveFabricReceivingFloor(salesOrderId: string): Promise<boolean> {
  const store = await readFabricReceiptsFreshAsync();
  return store.receipts.some(
    (receipt) =>
      receipt.sales_order_id === salesOrderId && ACTIVE_RECEIPT_STATUSES.has(receipt.status)
  );
}
