import type { SessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { mutateFabricReceipts } from "@/lib/data/fabric-receipts";
import { appendGarmentTypeChange } from "@/lib/data/garment-type-changes";
import { readPatternJobsFresh } from "@/lib/data/pattern-jobs";
import { readProductionWorkOrdersFreshAsync, writeProductionWorkOrders } from "@/lib/data/production-work-orders";
import { readSalesOrders, writeSalesOrders } from "@/lib/data/sales-orders";
import { notifyIntegration } from "@/lib/integrations";
import { syncPatternJobsFromSalesOrder } from "@/lib/pattern/sync-from-sales-order";
import { garmentTypeChangeBlockedReason } from "@/lib/sales-orders/change-garment-type-rules";
import {
  recordFabricChangeAlert,
  snapshotFabricLine,
} from "@/lib/sales-orders/fabric-change-alerts";
import {
  fabricLineArticleNumber,
  generateFabricLabelStickers,
  getGarmentPieces,
} from "@/lib/sales-orders/label-codes";
import { resolveOrderClientReference } from "@/lib/sales-orders/fabric-lines";
import type { GarmentTypeChange } from "@/lib/types/garment-type-changes";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export { canChangeGarmentType, garmentTypeChangeBlockedReason } from "@/lib/sales-orders/change-garment-type-rules";

export type ChangeGarmentTypeInput = {
  sales_order_id: string;
  line_id: string;
  garment_type: string;
  note?: string | null;
};

export type ChangeGarmentTypeResult = {
  change: GarmentTypeChange;
  order: SalesOrder;
  updated_line: SalesOrderFabricLine;
};

export async function changeFabricLineGarmentType(
  input: ChangeGarmentTypeInput,
  options: { changedBy: string; notify?: boolean }
): Promise<
  | { ok: true; result: ChangeGarmentTypeResult }
  | { ok: false; status: number; error: string }
> {
  const orderId = input.sales_order_id?.trim() ?? "";
  const lineId = input.line_id?.trim() ?? "";
  const nextGarmentType = input.garment_type?.trim() ?? "";

  if (!orderId || !lineId) {
    return { ok: false, status: 400, error: "sales_order_id and line_id are required." };
  }

  await ensureDocumentsLoaded(["sales_orders", "pattern_jobs", "fabric_receipts", "production_work_orders"]);

  const store = readSalesOrders();
  const orderIndex = store.orders.findIndex((order) => order.id === orderId);
  if (orderIndex < 0) {
    return { ok: false, status: 404, error: "Sales order not found." };
  }

  const order = store.orders[orderIndex]!;
  const lineIndex = order.fabric_lines.findIndex((line) => line.id === lineId);
  if (lineIndex < 0) {
    return { ok: false, status: 404, error: "Fabric line not found on this order." };
  }

  const existing = order.fabric_lines[lineIndex]!;
  const blockedReason = garmentTypeChangeBlockedReason(order, existing, nextGarmentType);
  if (blockedReason) {
    return { ok: false, status: 409, error: blockedReason };
  }

  const fromGarmentType = existing.garment_type;
  const clientReference = resolveOrderClientReference(order);
  const label_stickers = generateFabricLabelStickers(
    clientReference,
    lineIndex + 1,
    nextGarmentType
  );

  const updatedLine: SalesOrderFabricLine = {
    ...existing,
    garment_type: nextGarmentType,
    label_stickers,
    label_count: label_stickers.length,
  };

  const nextLines = order.fabric_lines.map((line, idx) => (idx === lineIndex ? updatedLine : line));
  store.orders[orderIndex] = { ...order, fabric_lines: nextLines };
  await writeSalesOrders(store);
  const savedOrder = store.orders[orderIndex]!;

  await syncPatternJobsFromSalesOrder(savedOrder, { notify: options.notify !== false });

  const patternJob = readPatternJobsFresh().jobs.find(
    (job) => job.sales_order_line_id === lineId && job.status !== "cancelled"
  );

  await mutateFabricReceipts((receiptStore) => {
    for (const receipt of receiptStore.receipts) {
      if (receipt.sales_order_line_id === lineId) {
        receipt.garment_type = nextGarmentType;
        receipt.updated_at = new Date().toISOString();
      }
    }
  });

  const woStore = structuredClone(await readProductionWorkOrdersFreshAsync());
  const now = new Date().toISOString();
  let woUpdated = false;
  for (const wo of woStore.work_orders) {
    if (wo.sales_order_line_id !== lineId) continue;
    const pieces = getGarmentPieces(nextGarmentType);
    wo.garment_type = nextGarmentType;
    wo.piece_name = pieces.length === 1 ? pieces[0]! : wo.piece_name;
    wo.updated_at = now;
    woUpdated = true;
  }
  if (woUpdated) {
    await writeProductionWorkOrders(woStore);
  }

  const change: GarmentTypeChange = {
    id: `gtc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    changed_at: now,
    changed_by: options.changedBy,
    sales_order_id: savedOrder.id,
    so_number: savedOrder.so_number,
    sales_order_line_id: lineId,
    client_id: savedOrder.client_id,
    client_name: savedOrder.client_name,
    client_code: savedOrder.client_code,
    fabric_number: updatedLine.fabric_number,
    article_number: fabricLineArticleNumber(lineIndex),
    from_garment_type: fromGarmentType,
    to_garment_type: nextGarmentType,
    note: input.note?.trim() || null,
    pattern_job_id: patternJob?.id ?? null,
    admin_notified_at: null,
    acknowledged_at: null,
    acknowledged_by: null,
  };

  await appendGarmentTypeChange(change);

  if (options.notify !== false) {
    await notifyIntegration("sales_order.garment_type_changed", {
      change_id: change.id,
      sales_order_id: change.sales_order_id,
      so_number: change.so_number,
      line_id: change.sales_order_line_id,
      fabric_number: change.fabric_number,
      article_number: change.article_number,
      from_garment_type: change.from_garment_type,
      to_garment_type: change.to_garment_type,
      changed_by: change.changed_by,
      note: change.note,
      pattern_job_id: change.pattern_job_id,
    });
  }

  await ensureDocumentsLoaded(["fabric_change_alerts"]);
  await recordFabricChangeAlert({
    kind: "garment_corrected",
    order: savedOrder,
    lineId: lineId,
    before: snapshotFabricLine({ ...existing, garment_type: fromGarmentType }),
    after: snapshotFabricLine(updatedLine),
    createdBy: options.changedBy,
    articleNumber: fabricLineArticleNumber(lineIndex),
    evidenceLine: existing,
    notify: options.notify !== false,
  });

  return {
    ok: true,
    result: {
      change,
      order: savedOrder,
      updated_line: updatedLine,
    },
  };
}
