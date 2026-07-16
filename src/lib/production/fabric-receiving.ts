import {
  getFabricReceiptById,
  archiveFabricReceipt,
  getFabricReceiptByLineId,
  mutateFabricReceipts,
  readFabricReceipts,
  readFabricReceiptsFreshAsync,
} from "@/lib/data/fabric-receipts";
import { readProductionWorkOrders, writeProductionWorkOrders } from "@/lib/data/production-work-orders";
import { readSalesOrders } from "@/lib/data/sales-orders";
import {
  firstFabricPrepStep,
  isFabricPrepType,
  nextFabricPrepStep,
} from "@/lib/production/fabric-prep";
import {
  isFabricReceivingFloorLine,
  isSalesOrderFabricReceivingSettled,
  resolveFabricLineReceiveStatus,
} from "@/lib/production/fabric-receiving-floor";
import { qrScanPayload } from "@/lib/production/qr-labels";
import {
  fabricLineArticleNumber,
  generateFabricLabelStickers,
  getGarmentPieces,
  productionCodeFromSticker,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import { formatFabricSupplierName, normalizeFabricSupplierFields } from "@/lib/fabric-sourcing/supplier-display";
import {
  fabricLineHighlightLabel,
  fabricLineToHighlightStage,
  productionStageToHighlight,
  scanStageStyles,
  type ScanHighlightStage,
} from "@/lib/production/scan-stage-highlight";
import type {
  FabricLineReceiveStatus,
  FabricReceipt,
  FabricReceivingLineRow,
  FabricReceivingOrderRow,
  FabricReceivingOverview,
  PendingFabricLine,
} from "@/lib/types/fabric-receipts";
import type { FabricPrepStep, FabricPrepType, ProductionWorkOrder } from "@/lib/types/production";
import { isSalesOrderArchived } from "@/lib/sales-orders/archive";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

const INACTIVE_SALES_ORDER_STATUSES = new Set(["complete", "cancelled", "delivered"]);

function isActiveSalesOrder(order: { status: string }): boolean {
  return !INACTIVE_SALES_ORDER_STATUSES.has(order.status);
}

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
  return `${order.client_name} · ${order.so_number} · ${formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number)} ${line.fabric_number} · ${garmentLabel} · ${line.quantity} m`;
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
  const receivedLineIds = new Set([
    ...readFabricReceipts().receipts.map((receipt) => receipt.sales_order_line_id),
    ...readProductionWorkOrders().work_orders.map((workOrder) => workOrder.sales_order_line_id),
  ]);
  const linesOnProductionFloor = new Set(
    readProductionWorkOrders().work_orders.map((workOrder) => workOrder.sales_order_line_id)
  );
  const pending: PendingFabricLine[] = [];

  for (const order of readSalesOrders().orders) {
    if (!isActiveSalesOrder(order)) continue;
    order.fabric_lines.forEach((line, index) => {
      if (receivedLineIds.has(line.id)) return;
      if (linesOnProductionFloor.has(line.id)) return;

      const pieceNames = getGarmentPieces(line.garment_type);
      pending.push({
        sales_order_line_id: line.id,
        sales_order_id: order.id,
        so_number: order.so_number,
        client_name: order.client_name,
        garment_type: line.garment_type,
        piece_count: pieceNames.length,
        piece_names: pieceNames,
        supplier_id: line.supplier_id,
        supplier_name: formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number),
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

const PRODUCTION_PIPELINE_ORDER: ScanHighlightStage[] = [
  "cutting",
  "sewing",
  "garment_wash",
  "finishing",
  "packed",
  "completed",
];

function workOrdersByLineId(): Map<string, ProductionWorkOrder[]> {
  const map = new Map<string, ProductionWorkOrder[]>();
  for (const wo of readProductionWorkOrders().work_orders) {
    const list = map.get(wo.sales_order_line_id) ?? [];
    list.push(wo);
    map.set(wo.sales_order_line_id, list);
  }
  return map;
}

function resolveHandedOffLineStage(workOrders: ProductionWorkOrder[]): ScanHighlightStage {
  const active = workOrders.filter((wo) => wo.status !== "completed");
  if (active.length === 0) return "completed";

  const stages = new Set(active.map((wo) => productionStageToHighlight(wo.status)));
  for (const stage of PRODUCTION_PIPELINE_ORDER) {
    if (stages.has(stage)) return stage;
  }
  return "in_production";
}

function resolveLineScanStage(
  status: FabricLineReceiveStatus,
  prepStep: FabricPrepStep | null | undefined,
  workOrders: ProductionWorkOrder[]
): ScanHighlightStage {
  if (status === "handed_off") return resolveHandedOffLineStage(workOrders);
  return fabricLineToHighlightStage(status, prepStep);
}

function stickerScanStage(
  status: FabricLineReceiveStatus,
  prepStep: FabricPrepStep | null | undefined,
  stickerCode: string,
  workOrdersBySticker: Map<string, ProductionWorkOrder>
): ScanHighlightStage {
  const wo = workOrdersBySticker.get(stickerCode);
  if (wo) return productionStageToHighlight(wo.status);
  return fabricLineToHighlightStage(status, prepStep);
}

function buildLineStickerRows(
  order: SalesOrder,
  line: SalesOrderFabricLine,
  lineIndex: number,
  status: FabricLineReceiveStatus,
  prepStep: FabricPrepStep | null | undefined,
  workOrdersBySticker: Map<string, ProductionWorkOrder>
): FabricReceivingLineRow["stickers"] {
  const stickers =
    line.label_stickers?.length > 0
      ? line.label_stickers
      : generateFabricLabelStickers(
          order.client_reference ?? order.so_number,
          lineIndex + 1,
          line.garment_type
        );

  return stickers.map((sticker) => ({
    sticker_code: sticker.code,
    piece_name: sticker.piece_name,
    production_code: productionCodeFromSticker(sticker.code, order.client_code),
    scan_stage: stickerScanStage(status, prepStep, sticker.code, workOrdersBySticker),
  }));
}

function listRecentFabricScans(
  entries: Array<{ order: FabricReceivingOrderRow; line: FabricReceivingLineRow }>
): FabricReceivingOverview["recent_scans"] {
  return entries
    .filter(({ line }) => line.status === "received" || line.status === "fabric_prep")
    .sort((a, b) => {
      const aAt = a.line.updated_at ?? a.line.received_at ?? "";
      const bAt = b.line.updated_at ?? b.line.received_at ?? "";
      return bAt.localeCompare(aAt);
    })
    .slice(0, 12)
    .map(({ order, line }) => ({
      receipt_id: line.receipt_id,
      sales_order_line_id: line.sales_order_line_id,
      so_number: order.so_number,
      client_name: order.client_name,
      article_number: line.article_number,
      fabric_cut_code: line.fabric_cut_code,
      garment_type: line.garment_type,
      fabric_number: line.fabric_number,
      status: line.status,
      updated_at: line.updated_at ?? line.received_at,
    }));
}

export async function listFabricReceivingOverview(
  filter: "actionable" | "all_open" = "actionable"
): Promise<FabricReceivingOverview> {
  const allReceipts = (await readFabricReceiptsFreshAsync()).receipts;
  const receiptsByLineId = new Map<string, FabricReceipt>();
  for (const receipt of allReceipts) {
    receiptsByLineId.set(receipt.sales_order_line_id, receipt);
  }

  const workOrdersByLine = workOrdersByLineId();
  const workOrderBySticker = new Map<string, ProductionWorkOrder>();
  for (const wo of readProductionWorkOrders().work_orders) {
    workOrderBySticker.set(wo.sticker_code, wo);
  }

  const orders: FabricReceivingOrderRow[] = [];
  let pendingLines = 0;
  let activeQueueLines = 0;

  for (const order of readSalesOrders().orders) {
    if (!isActiveSalesOrder(order)) continue;
    if (order.fabric_lines.length === 0) continue;

    const lines: FabricReceivingLineRow[] = [];

    order.fabric_lines.forEach((line, index) => {
      const receipt = receiptsByLineId.get(line.id);
      const lineWorkOrders = workOrdersByLine.get(line.id) ?? [];
      const status = resolveFabricLineReceiveStatus(receipt, lineWorkOrders);
      if (filter === "actionable" && !isFabricReceivingFloorLine(status, order, line)) {
        return;
      }

      const prepStep = receipt?.fabric_prep_step ?? null;
      const stickerRows = buildLineStickerRows(order, line, index, status, prepStep, workOrderBySticker);
      const scan_stage = resolveLineScanStage(status, prepStep, lineWorkOrders);
      const scan_stage_label =
        status === "handed_off"
          ? scanStageStyles(scan_stage).label
          : fabricLineHighlightLabel(status, prepStep);
      const firstSticker = stickerRows[0]?.sticker_code ?? `${order.client_reference ?? order.so_number}-L${String(index + 1).padStart(2, "0")}`;
      const fabric_cut_code = supplierFabricProductionCode(firstSticker, order.client_code);

      if (status === "pending") pendingLines += 1;
      if (status === "received" || status === "fabric_prep") activeQueueLines += 1;

      lines.push({
        sales_order_line_id: line.id,
        receipt_id: receipt?.id ?? null,
        article_number: fabricLineArticleNumber(index),
        garment_type: line.garment_type,
        fabric_number: line.fabric_number,
        supplier_id: line.supplier_id,
        supplier_name: formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number),
        fabric_meters: line.quantity,
        composition: line.composition,
        weight_gsm: line.weight_gsm,
        width_cm: line.width_cm,
        width_inches: line.width_inches,
        status,
        fabric_cut_code,
        qr_payload: qrScanPayload(fabric_cut_code),
        stickers: stickerRows,
        received_at: receipt?.received_at ?? null,
        updated_at: receipt?.updated_at ?? receipt?.received_at ?? null,
        fabric_prep_type: receipt?.fabric_prep_type ?? null,
        fabric_prep_step: prepStep,
        scan_stage,
        scan_stage_label,
        has_defect_report: Boolean(receipt?.defect_reports?.length),
        open_defect_count: (receipt?.defect_reports ?? []).filter((item) => item.status === "open")
          .length,
      });
    });

    if (lines.length === 0) continue;

    const lineStatuses = new Map(
      order.fabric_lines.map((line) => {
        const receipt = receiptsByLineId.get(line.id);
        const lineWorkOrders = workOrdersByLine.get(line.id) ?? [];
        return [line.id, resolveFabricLineReceiveStatus(receipt, lineWorkOrders)] as const;
      })
    );
    const orderWorkOrders = order.fabric_lines.flatMap(
      (line) => workOrdersByLine.get(line.id) ?? []
    );
    const settled = isSalesOrderFabricReceivingSettled(order, lineStatuses, orderWorkOrders);

    orders.push({
      sales_order_id: order.id,
      so_number: order.so_number,
      client_name: order.client_name,
      client_code: order.client_code,
      order_date: order.order_date,
      is_archived: isSalesOrderArchived(order) || settled,
      order_status: order.status,
      lines,
      pending_line_count: lines.filter((line) => line.status === "pending").length,
      active_line_count: lines.filter((line) => line.status === "received" || line.status === "fabric_prep").length,
    });
  }

  orders.sort((a, b) => {
    if (a.pending_line_count !== b.pending_line_count) {
      return b.pending_line_count - a.pending_line_count;
    }
    return b.so_number.localeCompare(a.so_number);
  });

  const totalLinesShown = orders.reduce((sum, order) => sum + order.lines.length, 0);
  const lineEntries = orders.flatMap((order) => order.lines.map((line) => ({ order, line })));

  return {
    orders,
    recent_scans: listRecentFabricScans(lineEntries),
    summary: {
      open_orders: orders.length,
      pending_lines: pendingLines,
      active_queue_lines: activeQueueLines,
      total_lines_shown: totalLinesShown,
    },
  };
}

export async function receiveFabricLine(sales_order_line_id: string): Promise<{
  receipt: FabricReceipt;
  created: boolean;
  garment_description: string;
}> {
  const lookup = findSalesOrderLine(sales_order_line_id);
  if (!lookup) {
    throw new Error("Sales order fabric line not found.");
  }

  const { order, line } = lookup;

  return mutateFabricReceipts((store) => {
    const existing = store.receipts.find((item) => item.sales_order_line_id === sales_order_line_id);
    if (existing) {
      return {
        receipt: existing,
        created: false,
        garment_description: line.garment_type,
      };
    }

    const now = new Date().toISOString();
    const supplierFields = normalizeFabricSupplierFields(line.supplier_id, line.supplier_name, line.fabric_number);

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
      supplier_id: supplierFields.supplier_id,
      supplier_name: supplierFields.supplier_name,
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

    store.receipts.unshift(receipt);

    return {
      receipt,
      created: true,
      garment_description: line.garment_type,
    };
  });
}

export async function startFabricReceiptPrep(id: string, fabric_prep_type: FabricPrepType): Promise<FabricReceipt> {
  if (!isFabricPrepType(fabric_prep_type)) {
    throw new Error("Select a fabric preparation type.");
  }

  return mutateFabricReceipts((store) => {
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

    return receipt;
  });
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
  const supplierName = formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number);
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
    supplier_name: supplierName,
    fabric_meters: line.quantity,
    status: "cutting" as const,
    fabric_prep_type: null,
    fabric_prep_step: null,
    received_at: receipt.received_at,
    updated_at: now,
    completed_at: null,
  }));
}

async function handoffFabricReceiptToProduction(receipt: FabricReceipt): Promise<ProductionWorkOrder[]> {
  const lookup = findSalesOrderLine(receipt.sales_order_line_id);
  if (!lookup) {
    throw new Error("Sales order fabric line not found.");
  }

  const workOrders = createProductionWorkOrdersFromReceipt(receipt, lookup.order, lookup.line, lookup.lineIndex);
  const productionStore = readProductionWorkOrders();
  productionStore.work_orders.unshift(...workOrders);
  await writeProductionWorkOrders(productionStore);

  return workOrders;
}

export async function advanceFabricReceipt(id: string): Promise<{
  receipt: FabricReceipt;
  work_orders: ProductionWorkOrder[];
}> {
  const handoffResult = await mutateFabricReceipts(async (store) => {
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
        return { receipt, work_orders: [] as ProductionWorkOrder[], handoff: false };
      }

      if (receipt.fabric_prep_step !== "iron") {
        throw new Error("Fabric preparation must finish with ironing before cutting.");
      }

      receipt.status = "handed_off";
      receipt.fabric_prep_type = null;
      receipt.fabric_prep_step = null;
      receipt.handed_off_at = now;
      receipt.updated_at = now;
      return { receipt, work_orders: [] as ProductionWorkOrder[], handoff: true };
    }

    if (receipt.status === "received") {
      throw new Error("Choose fabric preparation (wash, soak, or iron) before handoff.");
    }

    throw new Error("This fabric has already been handed off to production.");
  });

  if (handoffResult.handoff) {
    const work_orders = await handoffFabricReceiptToProduction(handoffResult.receipt);
    await archiveFabricReceipt(handoffResult.receipt);
    return { receipt: handoffResult.receipt, work_orders };
  }

  return { receipt: handoffResult.receipt, work_orders: handoffResult.work_orders };
}

export function formatFabricReceiptDescription(receipt: FabricReceipt): string {
  const pieces = getGarmentPieces(receipt.garment_type);
  if (pieces.length === 1) return receipt.garment_type;
  return `${receipt.garment_type} (${pieces.join(" + ")})`;
}

export function formatFabricReceiptHandoffMessage(receipt: FabricReceipt, workOrders: ProductionWorkOrder[]): string {
  const pieceNames = getGarmentPieces(receipt.garment_type);
  if (pieceNames.length > 1) {
    const pieces = workOrders.map((order) => order.piece_name).join(" + ") || pieceNames.join(" + ");
    return `Fabric prep complete — stick ${pieces} labels from the cutting pack, then scan at Cutting.`;
  }
  return `Fabric prep complete — ready for cutting. Scan the same fabric cut sticker at Cutting.`;
}
