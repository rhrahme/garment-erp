import {
  clientCodeFromReference,
  getGarmentPieces,
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

export function qrImageUrl(payload: string, size = 120): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(payload)}`;
}

export interface PrintableStickerLabel {
  sticker_code: string;
  client_code: string;
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
  qr_payload: string;
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
  };

  if (stickers.length === 0) {
    const ref = order.client_reference ?? order.so_number;
    const generated = `${ref}-L${String(lineIndex).padStart(2, "0")}`;
    const productionCode = productionCodeFromSticker(generated, clientCode);
    return [
      {
        sticker_code: generated,
        client_code: clientCode,
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
      client_code: clientCode,
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

export function buildLabelsForSalesOrder(order: SalesOrder): PrintableStickerLabel[] {
  return order.fabric_lines.flatMap((line, index) => lineToLabels(order, line, index + 1));
}

/** One physical sticker per fabric line — QR encodes fabric cut code for receive / wash / iron. */
/** Piece stickers for multi-piece garments only (suit, shirt+trouser, …). */
export function buildMultiPieceLabelsForSalesOrder(order: SalesOrder): PrintableStickerLabel[] {
  return buildLabelsForSalesOrder(order).filter(
    (label) => getGarmentPieces(label.garment_type).length > 1
  );
}

export function buildFabricCutLabelsForSalesOrder(order: SalesOrder): PrintableStickerLabel[] {
  return order.fabric_lines.flatMap((line, index) => {
    const pieceLabels = lineToLabels(order, line, index + 1);
    const first = pieceLabels[0];
    if (!first) return [];

    return [
      {
        ...first,
        production_code: first.fabric_cut_code,
        qr_payload: qrScanPayload(first.fabric_cut_code),
        piece_name: line.garment_type,
      },
    ];
  });
}

export function buildPoPrintSheet(po: PurchaseOrder, order: SalesOrder): PrintablePoSheet {
  const lineIds = new Set((po.lines ?? []).map((line) => line.fabric_number));
  const matchingLines = order.fabric_lines.filter((line) => lineIds.has(line.fabric_number));
  const labels = matchingLines.flatMap((line) => {
    const index = order.fabric_lines.findIndex((item) => item.id === line.id) + 1;
    return lineToLabels(order, line, index);
  });

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
