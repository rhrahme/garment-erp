import { readSalesOrders } from "@/lib/data/sales-orders";
import {
  getProductionWorkOrderBySticker,
  readProductionWorkOrders,
  writeProductionWorkOrders,
} from "@/lib/data/production-work-orders";
import {
  completeFabricPrepActionLabel,
  firstFabricPrepStep,
  isFabricPrepType,
} from "@/lib/production/fabric-prep";
import { formatLabelGarmentDescription, stickerCodesMatch } from "@/lib/sales-orders/label-codes";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import type {
  FabricPrepStep,
  FabricPrepType,
  ProductionStage,
  ProductionWorkOrder,
} from "@/lib/types/production";
import type { FabricLabelSticker, SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export type StickerLookupResult = {
  order: SalesOrder;
  line: SalesOrderFabricLine;
  sticker: FabricLabelSticker;
};

function normalizeWorkOrder(order: ProductionWorkOrder): ProductionWorkOrder {
  if (order.status === ("planned" as ProductionStage)) {
    return { ...order, status: "received" };
  }
  return order;
}

export function findStickerInSalesOrders(stickerCode: string): StickerLookupResult | null {
  const normalized = stickerCode.trim().toUpperCase();
  if (!normalized) return null;

  for (const order of readSalesOrders().orders) {
    for (const line of order.fabric_lines) {
      for (const sticker of line.label_stickers ?? []) {
        if (stickerCodesMatch(normalized, sticker.code, order.client_code)) {
          return { order, line, sticker };
        }
      }
    }
  }

  return null;
}

export async function scanStickerForProduction(stickerCode: string): Promise<{
  work_order: ProductionWorkOrder;
  created: boolean;
  garment_description: string;
}> {
  const existing = getProductionWorkOrderBySticker(stickerCode);
  if (existing) {
    const work_order = normalizeWorkOrder(existing);
    return {
      work_order,
      created: false,
      garment_description: formatLabelGarmentDescription(work_order.garment_type, work_order.piece_name),
    };
  }

  const lookup = findStickerInSalesOrders(stickerCode);
  if (!lookup) {
    throw new Error("Sticker code not found on any sales order.");
  }

  const { order, line, sticker } = lookup;
  const now = new Date().toISOString();

  const work_order: ProductionWorkOrder = {
    id: `pwo-${Date.now()}`,
    sticker_code: sticker.code,
    sales_order_id: order.id,
    so_number: order.so_number,
    sales_order_line_id: line.id,
    client_id: order.client_id,
    client_code: order.client_code,
    client_name: order.client_name,
    garment_type: line.garment_type,
    piece_name: sticker.piece_name,
    fabric_number: line.fabric_number,
    supplier_id: line.supplier_id,
    supplier_name: formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number),
    fabric_meters: line.quantity,
    status: "received",
    fabric_prep_type: null,
    fabric_prep_step: null,
    received_at: now,
    updated_at: now,
    completed_at: null,
  };

  const store = readProductionWorkOrders();
  store.work_orders.unshift(work_order);
  await writeProductionWorkOrders(store);

  return {
    work_order,
    created: true,
    garment_description: formatLabelGarmentDescription(line.garment_type, sticker.piece_name),
  };
}

export async function startFabricPrep(id: string, fabric_prep_type: FabricPrepType): Promise<ProductionWorkOrder> {
  if (!isFabricPrepType(fabric_prep_type)) {
    throw new Error("Select a fabric preparation type.");
  }

  const store = readProductionWorkOrders();
  const workOrder = store.work_orders.find((order) => order.id === id);
  if (!workOrder) {
    throw new Error("Production work order not found.");
  }

  const status = normalizeWorkOrder(workOrder).status;
  if (status !== "received") {
    throw new Error("Fabric preparation can only start after the fabric is received.");
  }

  const now = new Date().toISOString();
  workOrder.status = "fabric_prep";
  workOrder.fabric_prep_type = fabric_prep_type;
  workOrder.fabric_prep_step = firstFabricPrepStep(fabric_prep_type);
  workOrder.updated_at = now;

  await writeProductionWorkOrders(store);
  return workOrder;
}

function getNextProductionStage(current: ProductionStage): ProductionStage | null {
  const stages: ProductionStage[] = [
    "received",
    "fabric_prep",
    "cutting",
    "sewing",
    "washing",
    "finishing",
    "packed",
    "completed",
  ];
  const index = stages.indexOf(current);
  if (index < 0 || index >= stages.length - 1) return null;
  return stages[index + 1];
}

export async function advanceProductionWorkOrder(id: string): Promise<ProductionWorkOrder> {
  const store = readProductionWorkOrders();
  const workOrder = store.work_orders.find((order) => order.id === id);
  if (!workOrder) {
    throw new Error("Production work order not found.");
  }

  const now = new Date().toISOString();
  const status = normalizeWorkOrder(workOrder).status;

  if (status === "received" || status === "fabric_prep") {
    throw new Error("Fabric receiving and prep are handled under Fabric Receiving.");
  }

  const next = getNextProductionStage(status);
  if (!next || next === "fabric_prep") {
    throw new Error("This work order is already completed.");
  }

  workOrder.status = next;
  workOrder.updated_at = now;
  if (next === "completed") {
    workOrder.completed_at = now;
  }

  await writeProductionWorkOrders(store);
  return workOrder;
}

export { completeFabricPrepActionLabel };
