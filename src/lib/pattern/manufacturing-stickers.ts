import {
  pieceProductionCodeFromSticker,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import { qrScanPayload } from "@/lib/production/qr-labels";
import type { PatternJob } from "@/lib/types/pattern";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

/** One manufacturing QR - same payload as production / prep stickers. */
export type ManufacturingStickerQr = {
  /** Full sticker code stored on the SO fabric line. */
  code: string;
  piece_name: string;
  /** Short production / fabric-cut code shown under the QR. */
  production_code: string;
  /** Exact string encoded in the QR (uppercase production code). */
  qr_payload: string;
  /** Piece stickers (cutting/sewing) vs fabric-cut prep (receive/wash). */
  role: "piece" | "prep";
  /** 1-based piece index when multi-piece (Jacket = 1). */
  piece_index: number | null;
  /** Total pieces on the line (2 for Suit, 3 for Suit+Vest). */
  piece_total: number | null;
};

/**
 * Piece QRs for a fabric line - same encoding as sticker print / pattern sheet.
 * Suit -> Jacket-1/2 + Trouser-2/2; Suit+Vest -> JKT-1/3, VST-2/3, TR-3/3.
 */
export function pieceStickersForFabricLine(
  line: SalesOrderFabricLine,
  clientCode: string
): ManufacturingStickerQr[] {
  const stickers = [...(line.label_stickers ?? [])].sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)
  );
  const total = stickers.length;

  return stickers.map((sticker, index) => {
    const production_code = pieceProductionCodeFromSticker(sticker, clientCode, stickers);
    return {
      code: sticker.code,
      piece_name: sticker.piece_name,
      production_code,
      qr_payload: qrScanPayload(production_code),
      role: "piece" as const,
      piece_index: total > 1 ? index + 1 : null,
      piece_total: total > 1 ? total : null,
    };
  });
}

/** Fabric-cut prep QR (no piece suffix) - same as Preparation sticker sheet. */
export function fabricCutStickerForFabricLine(
  line: SalesOrderFabricLine,
  clientCode: string
): ManufacturingStickerQr | null {
  const stickers = [...(line.label_stickers ?? [])].sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)
  );
  const first = stickers[0];
  if (!first) return null;

  const production_code = supplierFabricProductionCode(first.code, clientCode);
  return {
    code: first.code,
    piece_name: "Fabric cut",
    production_code,
    qr_payload: qrScanPayload(production_code),
    role: "prep",
    piece_index: null,
    piece_total: null,
  };
}

/**
 * Manufacturing QRs for an SO fabric line.
 * Multi-piece: fabric-cut prep + one QR per piece (Jacket, Trouser, ...).
 * Single-piece: the one piece sticker QR (same as production sticker print).
 */
export function manufacturingStickersForFabricLine(
  line: SalesOrderFabricLine,
  clientCode: string
): ManufacturingStickerQr[] {
  const pieces = pieceStickersForFabricLine(line, clientCode);
  if (pieces.length <= 1) return pieces;

  const prep = fabricCutStickerForFabricLine(line, clientCode);
  return prep ? [prep, ...pieces] : pieces;
}

/**
 * Manufacturing QRs for a pattern job's SO fabric line.
 * Multi-piece: fabric-cut prep + one QR per piece (Jacket, Trouser, ...).
 * Single-piece: the one piece sticker QR (same as production sticker print).
 */
export function manufacturingStickersForJob(
  job: Pick<PatternJob, "sales_order_id" | "sales_order_line_id">,
  order: SalesOrder | null | undefined
): ManufacturingStickerQr[] {
  if (!order || order.id !== job.sales_order_id) return [];
  const line = order.fabric_lines.find((candidate) => candidate.id === job.sales_order_line_id);
  if (!line) return [];
  return manufacturingStickersForFabricLine(line, order.client_code);
}
