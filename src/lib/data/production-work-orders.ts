import path from "path";
import { readJsonFile, writeJsonFile } from "@/lib/data/json-file-cache";
import type { ProductionWorkOrder, ProductionWorkOrdersFile } from "@/lib/types/production";
import { productionCodeFromSticker, supplierFabricProductionCode } from "@/lib/sales-orders/label-codes";

const STORE_PATH = path.join(process.cwd(), "src/data/production-work-orders.json");
const EMPTY_PRODUCTION_WORK_ORDERS: ProductionWorkOrdersFile = { updated_at: null, work_orders: [] };

export function readProductionWorkOrders(): ProductionWorkOrdersFile {
  return readJsonFile(STORE_PATH, EMPTY_PRODUCTION_WORK_ORDERS);
}

export function writeProductionWorkOrders(data: ProductionWorkOrdersFile): ProductionWorkOrdersFile {
  const payload: ProductionWorkOrdersFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return writeJsonFile(STORE_PATH, payload);
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
