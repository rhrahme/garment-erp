import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { appendFabricTransfer } from "@/lib/data/fabric-transfers";
import { mutateFabricReceipts, readFabricReceiptsFresh } from "@/lib/data/fabric-receipts";
import { readProductionWorkOrders } from "@/lib/data/production-work-orders";
import { readSalesOrders, writeSalesOrders } from "@/lib/data/sales-orders";
import { createFabricPosFromSalesOrder } from "@/lib/sales-orders/create-fabric-pos";
import {
  buildFabricLineFromInput,
  resolveOrderClientReference,
} from "@/lib/sales-orders/fabric-lines";
import { orderStickerSheetHref } from "@/lib/orders/sticker-print-links";
import { syncPatternJobsFromSalesOrder } from "@/lib/pattern/sync-from-sales-order";
import type { SessionContext } from "@/lib/auth/session";
import type { FabricReceipt } from "@/lib/types/fabric-receipts";
import type { FabricTransfer, FabricTransferLineRef } from "@/lib/types/fabric-transfers";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export type TransferFabricInput = {
  source_sales_order_id: string;
  source_line_id: string;
  destination_sales_order_id: string;
  meters: number;
  reason: string;
};

export type TransferFabricResult = {
  transfer: FabricTransfer;
  source_order: SalesOrder;
  destination_order: SalesOrder;
  destination_line: SalesOrderFabricLine;
  replacement_line: SalesOrderFabricLine;
  replacement_fabric_orders: PurchaseOrder[];
  print_stickers_href: string;
};

export function canTransferFabric(session: Pick<SessionContext, "isAdmin" | "isClientManager">): boolean {
  return session.isAdmin || session.isClientManager;
}

function stickerCodes(line: SalesOrderFabricLine): string[] {
  return (line.label_stickers ?? []).map((sticker) => sticker.code);
}

/** Next L## index that will not collide with existing sticker codes on the order. */
function nextFabricLineIndex(lines: SalesOrderFabricLine[]): number {
  let max = 0;
  for (const line of lines) {
    for (const sticker of line.label_stickers ?? []) {
      const match = sticker.code.match(/-L(\d+)/i);
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  return max + 1;
}

function toLineRef(order: SalesOrder, line: SalesOrderFabricLine): FabricTransferLineRef {
  return {
    sales_order_id: order.id,
    so_number: order.so_number,
    client_id: order.client_id,
    client_code: order.client_code,
    client_name: order.client_name,
    line_id: line.id,
    fabric_number: line.fabric_number,
    garment_type: line.garment_type,
    supplier_id: line.supplier_id,
    supplier_name: line.supplier_name,
    sticker_codes: stickerCodes(line),
  };
}

function cloneLineAsInput(line: SalesOrderFabricLine, quantity: number) {
  return {
    garment_type: line.garment_type,
    supplier_id: line.supplier_id,
    supplier_name: line.supplier_name,
    fabric_number: line.fabric_number,
    quantity,
    unit: line.unit,
    unit_price: line.unit_price,
    composition: line.composition,
    weight_gsm: line.weight_gsm,
    width_cm: line.width_cm,
    width_inches: line.width_inches,
    color: line.color,
    stock_status: line.stock_status ?? null,
    restock_date: line.restock_date ?? null,
    needs_replacement: false,
    replacement_fabric_number: null,
  };
}

function assertNoProductionWorkOrders(lineId: string): string | null {
  const active = readProductionWorkOrders().work_orders.filter(
    (wo) => wo.sales_order_line_id === lineId && wo.status !== "completed"
  );
  if (active.length > 0) {
    return "Cannot transfer fabric that already has production work orders. Finish or archive production first.";
  }
  return null;
}

function rekeyReceiptForDestination(
  receipt: FabricReceipt,
  destOrder: SalesOrder,
  destLine: SalesOrderFabricLine,
  meters: number,
  now: string
): FabricReceipt {
  return {
    ...receipt,
    sales_order_id: destOrder.id,
    so_number: destOrder.so_number,
    sales_order_line_id: destLine.id,
    client_id: destOrder.client_id,
    client_code: destOrder.client_code,
    client_name: destOrder.client_name,
    garment_type: destLine.garment_type,
    fabric_number: destLine.fabric_number,
    supplier_id: destLine.supplier_id,
    supplier_name: destLine.supplier_name,
    fabric_meters: meters,
    composition: destLine.composition,
    weight_gsm: destLine.weight_gsm,
    updated_at: now,
  };
}

export async function transferFabricLine(
  input: TransferFabricInput,
  options: { transferredBy: string }
): Promise<{ ok: true; result: TransferFabricResult } | { ok: false; status: number; error: string }> {
  const sourceOrderId = String(input.source_sales_order_id ?? "").trim();
  const sourceLineId = String(input.source_line_id ?? "").trim();
  const destinationOrderId = String(input.destination_sales_order_id ?? "").trim();
  const reason = String(input.reason ?? "").trim();
  const meters = Number(input.meters);

  if (!sourceOrderId || !sourceLineId) {
    return { ok: false, status: 400, error: "Source sales order and fabric line are required." };
  }
  if (!destinationOrderId) {
    return { ok: false, status: 400, error: "Destination sales order is required." };
  }
  if (sourceOrderId === destinationOrderId) {
    return { ok: false, status: 400, error: "Choose a different destination sales order." };
  }
  if (!reason) {
    return { ok: false, status: 400, error: "A reason is required for the transfer audit trail." };
  }
  if (!Number.isFinite(meters) || meters <= 0) {
    return { ok: false, status: 400, error: "Enter a valid meters amount to transfer." };
  }

  await ensureDocumentsLoaded([
    "sales_orders",
    "fabric_receipts",
    "fabric_orders",
    "fabric_transfers",
    "pattern_jobs",
    "production_work_orders",
    "supplier_contacts",
  ]);

  const store = readSalesOrders();
  const sourceIndex = store.orders.findIndex((order) => order.id === sourceOrderId);
  const destIndex = store.orders.findIndex((order) => order.id === destinationOrderId);
  if (sourceIndex < 0) {
    return { ok: false, status: 404, error: "Source sales order not found." };
  }
  if (destIndex < 0) {
    return { ok: false, status: 404, error: "Destination sales order not found." };
  }

  const sourceOrder = store.orders[sourceIndex]!;
  const destOrder = store.orders[destIndex]!;

  if (sourceOrder.retail_brand?.trim() || destOrder.retail_brand?.trim()) {
    return { ok: false, status: 409, error: "Fabric transfer is only supported for bespoke client orders." };
  }
  if (sourceOrder.status === "complete" || destOrder.status === "complete") {
    return { ok: false, status: 409, error: "Cannot transfer fabric on a completed sales order." };
  }

  const sourceLineIndex = sourceOrder.fabric_lines.findIndex((line) => line.id === sourceLineId);
  if (sourceLineIndex < 0) {
    return { ok: false, status: 404, error: "Fabric line not found on the source order." };
  }

  const sourceLine = sourceOrder.fabric_lines[sourceLineIndex]!;
  if (sourceLine.transfer_inbound?.transfer_id) {
    return {
      ok: false,
      status: 409,
      error: "This line already came from a transfer. Transfer the destination line's fabric instead.",
    };
  }
  if (meters > sourceLine.quantity + 1e-9) {
    return {
      ok: false,
      status: 400,
      error: `Cannot transfer ${meters}m — source line only has ${sourceLine.quantity}m.`,
    };
  }

  const productionBlock = assertNoProductionWorkOrders(sourceLineId);
  if (productionBlock) {
    return { ok: false, status: 409, error: productionBlock };
  }

  const existingReceipt = readFabricReceiptsFresh().receipts.find(
    (receipt) => receipt.sales_order_line_id === sourceLineId
  );
  if (existingReceipt?.status === "handed_off") {
    return {
      ok: false,
      status: 409,
      error: "Cannot transfer fabric that has already been handed off to production.",
    };
  }

  const isPartial = meters < sourceLine.quantity - 1e-9;
  const remainingMeters = Math.max(0, Math.round((sourceLine.quantity - meters) * 1000) / 1000);
  const now = new Date().toISOString();
  const transferId = `ft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const linesAfterSourceChange = isPartial
    ? sourceOrder.fabric_lines.map((line, index) =>
        index === sourceLineIndex ? { ...line, quantity: remainingMeters } : line
      )
    : sourceOrder.fabric_lines.filter((line) => line.id !== sourceLineId);

  const destBuilt = buildFabricLineFromInput(
    cloneLineAsInput(sourceLine, meters),
    resolveOrderClientReference(destOrder),
    nextFabricLineIndex(destOrder.fabric_lines),
    {
      lineId: `line-xfer-in-${Date.now()}`,
      addedAt: now,
      addedBy: options.transferredBy,
    }
  );
  if ("error" in destBuilt) {
    return { ok: false, status: 400, error: destBuilt.error };
  }

  const replacementBuilt = buildFabricLineFromInput(
    cloneLineAsInput(sourceLine, meters),
    resolveOrderClientReference(sourceOrder),
    nextFabricLineIndex(linesAfterSourceChange),
    {
      lineId: `line-xfer-repl-${Date.now()}`,
      addedAt: now,
      addedBy: options.transferredBy,
    }
  );
  if ("error" in replacementBuilt) {
    return { ok: false, status: 400, error: replacementBuilt.error };
  }

  const destinationLine: SalesOrderFabricLine = {
    ...destBuilt,
    transfer_inbound: {
      transfer_id: transferId,
      source_so_number: sourceOrder.so_number,
      source_client_name: sourceOrder.client_name,
      source_line_id: sourceLine.id,
      original_sticker_codes: stickerCodes(sourceLine),
      meters,
    },
  };

  const replacementLine: SalesOrderFabricLine = {
    ...replacementBuilt,
    transfer_replacement: {
      transfer_id: transferId,
      destination_so_number: destOrder.so_number,
      destination_client_name: destOrder.client_name,
      meters,
    },
  };

  const nextSourceLines = [...linesAfterSourceChange, replacementLine];
  const nextDestLines = [...destOrder.fabric_lines, destinationLine];

  store.orders[sourceIndex] = {
    ...sourceOrder,
    fabric_lines: nextSourceLines,
  };
  store.orders[destIndex] = {
    ...destOrder,
    fabric_lines: nextDestLines,
  };

  const savedOrders = await writeSalesOrders(store);
  let savedSource = savedOrders.orders.find((order) => order.id === sourceOrderId)!;
  let savedDest = savedOrders.orders.find((order) => order.id === destinationOrderId)!;
  const savedDestLine = savedDest.fabric_lines.find((line) => line.id === destinationLine.id)!;
  const savedReplacement = savedSource.fabric_lines.find((line) => line.id === replacementLine.id)!;

  let destinationReceiptId: string | null = null;
  if (existingReceipt) {
    await mutateFabricReceipts((receiptsStore) => {
      const existingIndex = receiptsStore.receipts.findIndex(
        (receipt) => receipt.sales_order_line_id === sourceLineId
      );
      if (existingIndex < 0) return;

      const existing = receiptsStore.receipts[existingIndex]!;
      if (isPartial) {
        const keepMeters = Math.max(0, Math.round((existing.fabric_meters - meters) * 1000) / 1000);
        receiptsStore.receipts[existingIndex] = {
          ...existing,
          fabric_meters: keepMeters,
          updated_at: now,
        };

        const splitReceipt: FabricReceipt = rekeyReceiptForDestination(
          {
            ...existing,
            id: `fr-xfer-${Date.now()}`,
            defect_reports: [],
          },
          savedDest,
          savedDestLine,
          meters,
          now
        );
        receiptsStore.receipts.unshift(splitReceipt);
        destinationReceiptId = splitReceipt.id;
      } else {
        const moved = rekeyReceiptForDestination(existing, savedDest, savedDestLine, meters, now);
        receiptsStore.receipts[existingIndex] = moved;
        destinationReceiptId = moved.id;
      }
    });
  }

  let replacementFabricOrders: PurchaseOrder[] = [];
  try {
    const poResult = await createFabricPosFromSalesOrder(sourceOrderId);
    replacementFabricOrders = poResult.fabricOrders;
    savedSource = poResult.order;
  } catch (error) {
    // Replacement line is on the SO; admin can create POs from Today's fabric if this fails
    // (e.g. missing delivery destination). Keep the transfer.
    console.warn("Fabric transfer: could not auto-create replacement POs:", error);
  }

  await syncPatternJobsFromSalesOrder(savedSource, { forceCancelOrphans: !isPartial });
  await syncPatternJobsFromSalesOrder(savedDest);

  const transfer: FabricTransfer = {
    id: transferId,
    transferred_at: now,
    transferred_by: options.transferredBy,
    reason,
    meters,
    unit: sourceLine.unit || "meters",
    is_partial: isPartial,
    source: toLineRef(sourceOrder, sourceLine),
    source_remaining_meters: remainingMeters,
    destination: toLineRef(savedDest, savedDestLine),
    replacement: toLineRef(savedSource, savedReplacement),
    replacement_fabric_po_ids: replacementFabricOrders.map((po) => po.id),
    destination_receipt_id: destinationReceiptId,
  };

  await appendFabricTransfer(transfer);

  // Refresh dest after possible concurrent writes
  const finalStore = readSalesOrders();
  savedSource = finalStore.orders.find((order) => order.id === sourceOrderId) ?? savedSource;
  savedDest = finalStore.orders.find((order) => order.id === destinationOrderId) ?? savedDest;

  return {
    ok: true,
    result: {
      transfer,
      source_order: savedSource,
      destination_order: savedDest,
      destination_line: savedDestLine,
      replacement_line: savedReplacement,
      replacement_fabric_orders: replacementFabricOrders,
      print_stickers_href: orderStickerSheetHref(savedDest.id, "fabric-cuts", {
        lineId: savedDestLine.id,
      }),
    },
  };
}
