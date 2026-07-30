import {
  productionCodeFromSticker,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import { qrScanPayload } from "@/lib/production/qr-labels";
import type { PatternJob } from "@/lib/types/pattern";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

/** One manufacturing QR  same payload as production / prep stickers. */
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
};

/**
 * Piece QRs for a fabric line  same encoding as sticker print / pattern sheet.
 * Suit ? Jacket + Trouser; single-piece ? one sticker.
 */
export function pieceStickersForFabricLine(
  line: SalesOrderFabricLine,
  clientCode: string
): ManufacturingStickerQr[] {
  const stickers = [...(line.label_stickers ?? [])].sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)
  );

  return stickers.map((sticker) => {
    const production_code = productionCodeFromSticker(sticker.code, clientCode);
    return {
      code: sticker.code,
      piece_name: sticker.piece_name,
      production_code,
      qr_payload: qrScanPayload(production_code),
      role: "piece" as const,
    };
  });
}

/** Fabric-cut prep QR (no piece suffix)  same as Preparation sticker sheet. */
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
  };
}

/**
 * Manufacturing QRs for a pattern job's SO fabric line.
 * Multi-piece: fabric-cut prep + one QR per piece (Jacket, Trouser, …).
 * Single-piece: the one piece sticker QR (same as production sticker print).
 */
export function manufacturingStickersForJob(
  job: Pick<PatternJob, "sales_order_id" | "sales_order_line_id">,
  order: SalesOrder | null | undefined
): ManufacturingStickerQr[] {
  if (!order || order.id !== job.sales_order_id) return [];
  const line = order.fabric_lines.find((candidate) => candidate.id === job.sales_order_line_id);
  if (!line) return [];

  const pieces = pieceStickersForFabricLine(line, order.client_code);
  if (pieces.length <= 1) return pieces;

  const prep = fabricCutStickerForFabricLine(line, order.client_code);
  return prep ? [prep, ...pieces] : pieces;
}
