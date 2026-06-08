import {
  clientCodeFromReference,
  fabricLineArticleNumber,
  getGarmentPieces,
  lineArticleFromStickerCode,
  productionCodeFromSticker,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";

/** Payload encoded in the QR — short production code, scannable at every station. */
export function qrScanPayload(productionCode: string): string {
  return productionCode.trim().toUpperCase();
}

function qrUpstreamUrl(payload: string, size: number): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(payload)}`;
}

/** Same-origin URL for browser img tags — thermal printers need embedded images, not remote URLs. */
export function qrImageUrl(payload: string, size = 120): string {
  const params = new URLSearchParams({ data: payload, size: String(size) });
  return `/api/qr?${params.toString()}`;
}

/** Direct upstream URL for server-side fetch (PDF generation, API routes). */
export function qrImageFetchUrl(payload: string, size = 120): string {
  return qrUpstreamUrl(payload, size);
}

/** Receive / wash fabric-cut stickers vs production piece stickers. */
export type StickerRole = "prep" | "prod";

export const STICKER_ROLE_LABEL: Record<StickerRole, string> = {
  prep: "PREPARATION",
  prod: "PRODUCTION",
};

export function resolveStickerRole(
  label: Pick<PrintableStickerLabel, "production_code" | "fabric_cut_code">,
  role?: StickerRole
): StickerRole {
  if (role) return role;
  return label.production_code === label.fabric_cut_code ? "prep" : "prod";
}

export interface PrintableStickerLabel {
  sticker_code: string;
  /** Fabric line this sticker belongs to — used for partial print / mark-as-printed. */
  fabric_line_id: string;
  client_code: string;
  client_name: string;
  production_code: string;
  /** Line-level code for one sticker per fabric cut (supplier / receive). */
  fabric_cut_code: string;
  piece_name: string;
  fabric_number: string;
  garment_type: string;
  supplier_name: string;
  /** Fabric mill / supplier brand shown on the physical sticker. */
  fabric_brand: string;
  composition: string | null;
  weight_gsm: number | null;
  /** Fabric cut length ordered for this line. */
  cut_quantity: number;
  cut_unit: string;
  /** Factory labels sent to the supplier for this fabric line. */
  labels_sent: number;
  /** Matches A4 receiving PDF Art. column (L01 → 1, L02 → 2, …). */
  article_number: number;
  /** Numerator on the sticker — same as article_number for fabric-cut rolls. */
  sticker_index: number;
  /** Denominator — total fabric lines on the sales order (e.g. 14 → …/14). */
  sticker_total: number;
  qr_payload: string;
}

export function resolveStickerArticleNumber(
  label: Partial<Pick<PrintableStickerLabel, "article_number" | "sticker_code" | "sticker_index">>,
  fallbackIndex = 1
): number {
  if (label.sticker_index != null && label.sticker_index > 0) return label.sticker_index;
  if (label.article_number != null && label.article_number > 0) return label.article_number;
  const fromSticker = label.sticker_code ? lineArticleFromStickerCode(label.sticker_code) : null;
  if (fromSticker != null && fromSticker > 0) return fromSticker;
  return fallbackIndex;
}

/** Top-right batch mark — article position matches the A4 fabric list. */
export function formatStickerBatchMark(
  label: Partial<Pick<PrintableStickerLabel, "sticker_index" | "sticker_total" | "article_number" | "sticker_code">>
): string | null {
  const total = label.sticker_total;
  if (total == null || !Number.isFinite(total) || total <= 0) return null;
  const index = resolveStickerArticleNumber(label);
  if (!Number.isFinite(index) || index <= 0) return null;
  return `${index}/${total}`;
}

export function applyOrderStickerBatch(
  labels: PrintableStickerLabel[],
  order: SalesOrder
): PrintableStickerLabel[] {
  const total = Math.max(order.fabric_lines.length, 1);
  return labels.map((label, index) => {
    const article = resolveStickerArticleNumber(label, index + 1);
    return {
      ...label,
      article_number: article,
      sticker_index: article,
      sticker_total: total,
    };
  });
}

function formatQuantityAmount(quantity: number): string {
  if (Number.isInteger(quantity)) return String(quantity);
  const rounded = Math.round(quantity * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function normalizeQuantityUnit(unit: string): string {
  if (unit === "meters" || unit === "m") return "m";
  return unit;
}

/** e.g. "1.6 m" — length only; garment line carries CUT label (avoids smeared "cut" on thermal). */
export function formatStickerCutLength(quantity: number, unit: string): string {
  return `${formatQuantityAmount(quantity)} ${normalizeQuantityUnit(unit)}`;
}

/** e.g. "1 label" / "2 labels" */
export function formatStickerLabelsSent(count: number): string {
  return `${count} label${count === 1 ? "" : "s"}`;
}

export interface PrintablePoSheet {
  po_number: string;
  supplier_name: string;
  client_code: string;
  so_number: string;
  client_reference: string;
  labels: PrintableStickerLabel[];
}

function lineToLabels(
  order: SalesOrder,
  line: SalesOrderFabricLine,
  lineIndex: number
): PrintableStickerLabel[] {
  const clientCode = order.client_code;
  const stickers = line.label_stickers ?? [];
  const fabricMeta = {
    fabric_brand: formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number),
    composition: line.composition,
    weight_gsm: line.weight_gsm,
    cut_quantity: line.quantity,
    cut_unit: line.unit,
    labels_sent: line.label_count,
  };

  if (stickers.length === 0) {
    const ref = order.client_reference ?? order.so_number;
    const generated = `${ref}-L${String(lineIndex).padStart(2, "0")}`;
    const productionCode = productionCodeFromSticker(generated, clientCode);
    return [
      {
        sticker_code: generated,
        fabric_line_id: line.id,
        client_code: clientCode,
        client_name: order.client_name,
        article_number: lineIndex,
        sticker_index: lineIndex,
        sticker_total: order.fabric_lines.length,
        production_code: productionCode,
        fabric_cut_code: supplierFabricProductionCode(generated, clientCode),
        piece_name: line.garment_type,
        fabric_number: line.fabric_number,
        garment_type: line.garment_type,
        supplier_name: line.supplier_name,
        ...fabricMeta,
        qr_payload: qrScanPayload(productionCode),
      },
    ];
  }

  const fabricCutCode = supplierFabricProductionCode(stickers[0]!.code, clientCode);

  return stickers.map((sticker) => {
    const productionCode = productionCodeFromSticker(sticker.code, clientCode);
    return {
      sticker_code: sticker.code,
      fabric_line_id: line.id,
      client_code: clientCode,
      client_name: order.client_name,
      article_number: lineIndex,
      sticker_index: lineIndex,
      sticker_total: order.fabric_lines.length,
      production_code: productionCode,
      fabric_cut_code: fabricCutCode,
      piece_name: sticker.piece_name,
      fabric_number: line.fabric_number,
      garment_type: line.garment_type,
      supplier_name: line.supplier_name,
      ...fabricMeta,
      qr_payload: qrScanPayload(productionCode),
    };
  });
}

function articleNumberForLine(line: SalesOrderFabricLine, order: SalesOrder): number {
  const index = order.fabric_lines.findIndex((item) => item.id === line.id);
  return fabricLineArticleNumber(index >= 0 ? index : 0);
}

export function buildLabelsForSalesOrder(
  linesOrder: SalesOrder,
  batchOrder: SalesOrder = linesOrder
): PrintableStickerLabel[] {
  const labels = linesOrder.fabric_lines.flatMap((line) =>
    lineToLabels(batchOrder, line, articleNumberForLine(line, batchOrder))
  );
  return applyOrderStickerBatch(labels, batchOrder);
}

/** One physical sticker per fabric line — QR encodes fabric cut code for receive / wash / iron. */
/** Piece stickers for multi-piece garments only (suit, shirt+trouser, …). */
export function buildMultiPieceLabelsForSalesOrder(
  linesOrder: SalesOrder,
  batchOrder: SalesOrder = linesOrder
): PrintableStickerLabel[] {
  return buildLabelsForSalesOrder(linesOrder, batchOrder).filter(
    (label) => getGarmentPieces(label.garment_type).length > 1
  );
}

export function buildFabricCutLabelsForSalesOrder(
  linesOrder: SalesOrder,
  batchOrder: SalesOrder = linesOrder
): PrintableStickerLabel[] {
  const labels = linesOrder.fabric_lines.flatMap((line) => {
    const articleNumber = articleNumberForLine(line, batchOrder);
    const pieceLabels = lineToLabels(batchOrder, line, articleNumber);
    const first = pieceLabels[0];
    if (!first) return [];

    return [
      {
        ...first,
        article_number: articleNumber,
        sticker_index: articleNumber,
        sticker_total: batchOrder.fabric_lines.length,
        production_code: first.fabric_cut_code,
        qr_payload: qrScanPayload(first.fabric_cut_code),
        piece_name: line.garment_type,
      },
    ];
  });
  return applyOrderStickerBatch(labels, batchOrder);
}

export function buildPoPrintSheet(po: PurchaseOrder, order: SalesOrder): PrintablePoSheet {
  const lineIds = new Set((po.lines ?? []).map((line) => line.fabric_number));
  const matchingLines = order.fabric_lines.filter((line) => lineIds.has(line.fabric_number));
  const labels = applyOrderStickerBatch(
    matchingLines.flatMap((line) => {
      const index = order.fabric_lines.findIndex((item) => item.id === line.id);
      const articleNumber = fabricLineArticleNumber(index);
      return lineToLabels(order, line, articleNumber);
    }),
    order
  );

  return {
    po_number: po.po_number,
    supplier_name: po.supplier?.name ?? po.supplier_id,
    client_code: order.client_code,
    so_number: order.so_number,
    client_reference: order.client_reference ?? clientCodeFromReference(order.client_reference ?? ""),
    labels,
  };
}

export function buildAllPoPrintSheets(
  order: SalesOrder,
  pos: PurchaseOrder[]
): PrintablePoSheet[] {
  return pos
    .filter((po) => po.sales_order_id === order.id || po.client_reference?.includes(order.so_number))
    .map((po) => buildPoPrintSheet(po, order));
}
