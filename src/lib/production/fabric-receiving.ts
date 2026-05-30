import { getFabricReceiptById, getFabricReceiptByLineId, readFabricReceipts, writeFabricReceipts } from "@/lib/data/fabric-receipts";
import { readProductionWorkOrders, writeProductionWorkOrders } from "@/lib/data/production-work-orders";
import { readSalesOrders } from "@/lib/data/sales-orders";
import {
  firstFabricPrepStep,
  isFabricPrepType,
  nextFabricPrepStep,
} from "@/lib/production/fabric-prep";
import { formatLabelGarmentDescription, generateFabricLabelStickers, getGarmentPieces } from "@/lib/sales-orders/label-codes";
import type { FabricReceipt, PendingFabricLine } from "@/lib/types/fabric-receipts";
import type { FabricPrepType, ProductionWorkOrder } from "@/lib/types/production";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function findSalesOrderLine(lineId: string): { order: SalesOrder; line: SalesOrderFabricLine; lineIndex: number } | null {
  for (const order of readSalesOrders().orders) {
    const lineIndex = order.fabric_lines.findIndex((line) => line.id === lineId);
    if (lineIndex >= 0) {
      return { order, line: order.fabric_lines[lineIndex]!, lineIndex };
    }
  }
  return null;
}

function formatPendingLabel(
  order: SalesOrder,
  line: SalesOrderFabricLine,
  pieceNames: string[]
): string {
  const garmentLabel =
    pieceNames.length > 1 ? `${line.garment_type} (${pieceNames.join(" + ")})` : line.garment_type;
  return `${order.client_name} · ${order.so_number} · ${line.supplier_name} ${line.fabric_number} · ${garmentLabel} · ${line.quantity} m`;
}

function enrichFabricReceipt(receipt: FabricReceipt): FabricReceipt {
  if (receipt.composition != null && receipt.weight_gsm != null) {
    return receipt;
  }

  const lookup = findSalesOrderLine(receipt.sales_order_line_id);
  if (!lookup) return receipt;

  return {
    ...receipt,
    composition: receipt.composition ?? lookup.line.composition,
    weight_gsm: receipt.weight_gsm ?? lookup.line.weight_gsm,
  };
}

export function listPendingFabricLines(): PendingFabricLine[] {
  const receivedLineIds = new Set(readFabricReceipts().receipts.map((receipt) => receipt.sales_order_line_id));
  const pending: PendingFabricLine[] = [];

  for (const order of readSalesOrders().orders) {
    order.fabric_lines.forEach((line, index) => {
      if (receivedLineIds.has(line.id)) return;

      const pieceNames = getGarmentPieces(line.garment_type);
      pending.push({
        sales_order_line_id: line.id,
        sales_order_id: order.id,
        so_number: order.so_number,
        client_name: order.client_name,
        garment_type: line.garment_type,
        piece_count: pieceNames.length,
        piece_names: pieceNames,
        supplier_name: line.supplier_name,
        fabric_number: line.fabric_number,
        fabric_meters: line.quantity,
        composition: line.composition,
        weight_gsm: line.weight_gsm,
        label: formatPendingLabel(order, line, pieceNames),
      });
    });
  }

  return pending.sort((a, b) => {
    const so = a.so_number.localeCompare(b.so_number);
    if (so !== 0) return so;
    return a.sales_order_line_id.localeCompare(b.sales_order_line_id);
  });
}

export function listActiveFabricReceipts(): FabricReceipt[] {
  return readFabricReceipts()
    .receipts.filter((receipt) => receipt.status === "received" || receipt.status === "fabric_prep")
    .map(enrichFabricReceipt)
    .sort((a, b) => b.received_at.localeCompare(a.received_at));
}

export function receiveFabricLine(sales_order_line_id: string): {
  receipt: FabricReceipt;
  created: boolean;
  garment_description: string;
} {
  const lookup = findSalesOrderLine(sales_order_line_id);
  if (!lookup) {
    throw new Error("Sales order fabric line not found.");
  }

  const existing = getFabricReceiptByLineId(sales_order_line_id);
  if (existing) {
    return {
      receipt: existing,
      created: false,
      garment_description: lookup.line.garment_type,
    };
  }

  const { order, line } = lookup;
  const now = new Date().toISOString();

  const receipt: FabricReceipt = {
    id: `fr-${Date.now()}`,
    sales_order_id: order.id,
    so_number: order.so_number,
    sales_order_line_id: line.id,
    client_id: order.client_id,
    client_code: order.client_code,
    client_name: order.client_name,
    garment_type: line.garment_type,
    fabric_number: line.fabric_number,
    supplier_id: line.supplier_id,
    supplier_name: line.supplier_name,
    fabric_meters: line.quantity,
    composition: line.composition,
    weight_gsm: line.weight_gsm,
    status: "received",
    fabric_prep_type: null,
    fabric_prep_step: null,
    received_at: now,
    updated_at: now,
    handed_off_at: null,
  };

  const store = readFabricReceipts();
  store.receipts.unshift(receipt);
  writeFabricReceipts(store);

  return {
    receipt,
    created: true,
    garment_description: line.garment_type,
  };
}

export function startFabricReceiptPrep(id: string, fabric_prep_type: FabricPrepType): FabricReceipt {
  if (!isFabricPrepType(fabric_prep_type)) {
    throw new Error("Select a fabric preparation type.");
  }

  const store = readFabricReceipts();
  const receipt = store.receipts.find((item) => item.id === id);
  if (!receipt) {
    throw new Error("Fabric receipt not found.");
  }
  if (receipt.status !== "received") {
    throw new Error("Fabric preparation can only start after the fabric is received.");
  }

  const now = new Date().toISOString();
  receipt.status = "fabric_prep";
  receipt.fabric_prep_type = fabric_prep_type;
  receipt.fabric_prep_step = firstFabricPrepStep(fabric_prep_type);
  receipt.updated_at = now;

  writeFabricReceipts(store);
  return receipt;
}

function createProductionWorkOrdersFromReceipt(
  receipt: FabricReceipt,
  order: SalesOrder,
  line: SalesOrderFabricLine,
  lineIndex: number
): ProductionWorkOrder[] {
  const stickers =
    line.label_stickers?.length > 0
      ? line.label_stickers
      : generateFabricLabelStickers(order.client_reference ?? order.so_number, lineIndex + 1, line.garment_type);

  const now = new Date().toISOString();
  return stickers.map((sticker, index) => ({
    id: `pwo-${Date.now()}-${index}`,
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
    supplier_name: line.supplier_name,
    fabric_meters: line.quantity,
    status: "cutting" as const,
    fabric_prep_type: null,
    fabric_prep_step: null,
    received_at: receipt.received_at,
    updated_at: now,
    completed_at: null,
  }));
}

function handoffFabricReceiptToProduction(receipt: FabricReceipt): ProductionWorkOrder[] {
  const lookup = findSalesOrderLine(receipt.sales_order_line_id);
  if (!lookup) {
    throw new Error("Sales order fabric line not found.");
  }

  const workOrders = createProductionWorkOrdersFromReceipt(receipt, lookup.order, lookup.line, lookup.lineIndex);
  const productionStore = readProductionWorkOrders();
  productionStore.work_orders.unshift(...workOrders);
  writeProductionWorkOrders(productionStore);

  return workOrders;
}

export function advanceFabricReceipt(id: string): {
  receipt: FabricReceipt;
  work_orders: ProductionWorkOrder[];
} {
  const store = readFabricReceipts();
  const receipt = store.receipts.find((item) => item.id === id);
  if (!receipt) {
    throw new Error("Fabric receipt not found.");
  }

  const now = new Date().toISOString();

  if (receipt.status === "fabric_prep") {
    if (!receipt.fabric_prep_type || !receipt.fabric_prep_step) {
      throw new Error("Fabric preparation type is missing.");
    }

    const nextStep = nextFabricPrepStep(receipt.fabric_prep_type, receipt.fabric_prep_step);
    if (nextStep) {
      receipt.fabric_prep_step = nextStep;
      receipt.updated_at = now;
      writeFabricReceipts(store);
      return { receipt, work_orders: [] };
    }

    if (receipt.fabric_prep_step !== "iron") {
      throw new Error("Fabric preparation must finish with ironing before cutting.");
    }

    receipt.status = "handed_off";
    receipt.fabric_prep_type = null;
    receipt.fabric_prep_step = null;
    receipt.handed_off_at = now;
    receipt.updated_at = now;
    writeFabricReceipts(store);

    const work_orders = handoffFabricReceiptToProduction(receipt);
    return { receipt, work_orders };
  }

  if (receipt.status === "received") {
    throw new Error("Choose fabric preparation (wash, soak, or iron) before handoff.");
  }

  throw new Error("This fabric has already been handed off to production.");
}

export function formatFabricReceiptDescription(receipt: FabricReceipt): string {
  const pieces = getGarmentPieces(receipt.garment_type);
  if (pieces.length === 1) return receipt.garment_type;
  return `${receipt.garment_type} (${pieces.join(" + ")})`;
}

export function formatFabricReceiptHandoffMessage(receipt: FabricReceipt, workOrders: ProductionWorkOrder[]): string {
  if (workOrders.length === 1) {
    return `Fabric prep complete — ${formatLabelGarmentDescription(workOrders[0]!.garment_type, workOrders[0]!.piece_name)} handed off to Production.`;
  }
  const pieces = workOrders.map((order) => order.piece_name).join(" + ");
  return `Fabric prep complete — ${receipt.garment_type} split into ${workOrders.length} pieces (${pieces}) on Production.`;
}
