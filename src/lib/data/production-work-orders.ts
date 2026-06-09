import path from "path";
import { readJsonFile, saveDocument } from "@/lib/data/document-persistence";
import type { ProductionWorkOrder, ProductionWorkOrdersFile } from "@/lib/types/production";
import { productionCodeFromSticker, supplierFabricProductionCode } from "@/lib/sales-orders/label-codes";

const STORE_PATH = path.join(process.cwd(), "src/data/production-work-orders.json");
const EMPTY_PRODUCTION_WORK_ORDERS: ProductionWorkOrdersFile = { updated_at: null, work_orders: [] };

export function readProductionWorkOrders(): ProductionWorkOrdersFile {
  return readJsonFile(STORE_PATH, EMPTY_PRODUCTION_WORK_ORDERS);
}

export async function writeProductionWorkOrders(
  data: ProductionWorkOrdersFile
): Promise<ProductionWorkOrdersFile> {
  const payload: ProductionWorkOrdersFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(STORE_PATH, payload);
}

export function getProductionWorkOrderBySticker(stickerCode: string): ProductionWorkOrder | undefined {
  const normalized = stickerCode.trim().toUpperCase();
  return readProductionWorkOrders().work_orders.find((order) => {
    if (order.sticker_code.toUpperCase() === normalized) return true;
    if (productionCodeFromSticker(order.sticker_code, order.client_code).toUpperCase() === normalized) {
      return true;
    }
    return supplierFabricProductionCode(order.sticker_code, order.client_code).toUpperCase() === normalized;
  });
}

export function getProductionWorkOrderById(id: string): ProductionWorkOrder | undefined {
  return readProductionWorkOrders().work_orders.find((order) => order.id === id);
}

/** Remove work orders created from fabric handoff — testing reset only. */
export async function removeProductionWorkOrdersForLineIds(lineIds: string[]): Promise<string[]> {
  const lineIdSet = new Set(lineIds);
  const store = readProductionWorkOrders();
  const removedIds: string[] = [];
  const nextWorkOrders = store.work_orders.filter((workOrder) => {
    if (lineIdSet.has(workOrder.sales_order_line_id)) {
      removedIds.push(workOrder.id);
      return false;
    }
    return true;
  });

  if (removedIds.length === 0) return removedIds;

  await writeProductionWorkOrders({ ...store, work_orders: nextWorkOrders });
  return removedIds;
}
