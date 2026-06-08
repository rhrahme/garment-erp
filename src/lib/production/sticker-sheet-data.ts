import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrderByIdFresh } from "@/lib/data/sales-orders";
import { listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";
import {
  getFabricLineIdsForPrint,
  linesNeedingPrint,
  orderWithFabricLines,
} from "@/lib/sales-orders/fabric-lines";
import {
  applyOrderStickerBatch,
  buildAllPoPrintSheets,
  buildFabricCutLabelsForSalesOrder,
  buildLabelsForSalesOrder,
  buildMultiPieceLabelsForSalesOrder,
  buildPoPrintSheet,
  type PrintablePoSheet,
  type PrintableStickerLabel,
} from "@/lib/production/qr-labels";
import type { StickerPdfEntry } from "@/lib/production/generate-sticker-pdf";
import type { StickerRole } from "@/lib/production/qr-labels";
import type { SalesOrder } from "@/lib/types/sales-orders";

export type StickerSheetKind = "fabric-cuts" | "pieces" | "print-pack";

export type StickerSheetQuery = {
  sheet?: StickerSheetKind | "test";
  poNumber?: string | null;
  poId?: string | null;
};

function printLineIds(order: SalesOrder) {
  return {
    a4: getFabricLineIdsForPrint(order, "a4"),
    prep_stickers: getFabricLineIdsForPrint(order, "prep_stickers"),
    prod_stickers: getFabricLineIdsForPrint(order, "prod_stickers"),
  };
}

function mapLabels(labels: PrintableStickerLabel[], order: SalesOrder): PrintableStickerLabel[] {
  return applyOrderStickerBatch(labels, order);
}

function resolvePoSheets(
  order: SalesOrder,
  poNumber?: string | null,
  poId?: string | null
): PrintablePoSheet[] {
  const pos = listStoredFabricOrders().filter(
    (po) => po.sales_order_id === order.id || po.client_reference?.includes(order.so_number)
  );

  if (poNumber) {
    const match = pos.find((po) => po.po_number === poNumber);
    return match ? [buildPoPrintSheet(match, order)] : [];
  }
  if (poId) {
    const match = pos.find((po) => po.id === poId);
    return match ? [buildPoPrintSheet(match, order)] : [];
  }
  return buildAllPoPrintSheets(order, pos);
}

function labelsForSheet(
  order: SalesOrder,
  sheet: StickerSheetKind,
  poNumber?: string | null,
  poId?: string | null
): StickerPdfEntry[] {
  const prepLines = linesNeedingPrint(order.fabric_lines, "prep_stickers");
  const prodLines = linesNeedingPrint(order.fabric_lines, "prod_stickers");
  const prepOrder = orderWithFabricLines(order, prepLines);
  const prodOrder = orderWithFabricLines(order, prodLines);

  if (sheet === "print-pack") {
    const fabricCutLabels = mapLabels(buildFabricCutLabelsForSalesOrder(prepOrder, order), order);
    const cuttingPieceLabels = mapLabels(buildMultiPieceLabelsForSalesOrder(prodOrder, order), order);
    return [
      ...fabricCutLabels.map((label) => ({ label, role: "prep" as StickerRole })),
      ...cuttingPieceLabels.map((label) => ({ label, role: "prod" as StickerRole })),
    ];
  }

  const poSheets = resolvePoSheets(order, poNumber, poId);
  const role: StickerRole = sheet === "fabric-cuts" ? "prep" : "prod";
  const activeLabels =
    sheet === "fabric-cuts"
      ? mapLabels(buildFabricCutLabelsForSalesOrder(prepOrder, order), order)
      : mapLabels(buildLabelsForSalesOrder(prodOrder, order), order);

  if (poSheets.length > 0 && (poNumber || poId)) {
    const filtered = poSheets.flatMap((poSheet) => {
      const fabricNumbers = new Set(poSheet.labels.map((label) => label.fabric_number));
      const labels =
        sheet === "fabric-cuts"
          ? activeLabels.filter((label) => fabricNumbers.has(label.fabric_number))
          : poSheet.labels.filter((label) =>
              prodLines.some((line) => line.fabric_number === label.fabric_number)
            );
      return mapLabels(labels, order);
    });
    return filtered.map((label) => ({ label, role }));
  }

  if (poSheets.length > 0) {
    return poSheets.flatMap((poSheet) => {
      const fabricNumbers = new Set(poSheet.labels.map((label) => label.fabric_number));
      const labels =
        sheet === "fabric-cuts"
          ? activeLabels.filter((label) => fabricNumbers.has(label.fabric_number))
          : poSheet.labels.filter((label) =>
              prodLines.some((line) => line.fabric_number === label.fabric_number)
            );
      return mapLabels(labels, order).map((label) => ({ label, role }));
    });
  }

  return activeLabels.map((label) => ({ label, role }));
}

export async function loadStickerPdfEntries(orderId: string, query: StickerSheetQuery = {}) {
  await ensureDocumentsLoaded(["sales_orders"]);
  const order = await getSalesOrderByIdFresh(orderId);
  if (!order) return null;

  const sheet = query.sheet ?? "pieces";
  if (sheet === "test") {
    return { order, entries: [] as StickerPdfEntry[], unprinted_line_ids: printLineIds(order) };
  }

  const entries = labelsForSheet(order, sheet, query.poNumber, query.poId);
  return {
    order,
    entries,
    unprinted_line_ids: printLineIds(order),
  };
}
