import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
import { getLabelCountForGarment } from "@/lib/sales-orders/garment-types";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

type LineLabelCountSource = Pick<SalesOrderFabricLine, "garment_type" | "label_count" | "label_stickers">;

/** Best-known factory label count for a line — stickers, stored count, or garment default. */
export function resolveFabricLineLabelCount(line: LineLabelCountSource): number {
  if (line.label_stickers != null) return line.label_stickers.length;
  if (line.label_count != null && Number.isFinite(line.label_count)) return line.label_count;
  return getLabelCountForGarment(line.garment_type);
}

/** Total piece labels across all fabric lines (suit line = 2, shirt = 1). */
export function totalProductionLabels(lines: SalesOrderFabricLine[]): number {
  return lines.reduce((sum, line) => sum + resolveFabricLineLabelCount(line), 0);
}

/** Human-readable label summary for one fabric line — e.g. "2 labels (Jacket + Trouser)". */
export function formatFabricLineLabels(line: SalesOrderFabricLine): string {
  const pieces = line.label_stickers?.map((sticker) => sticker.piece_name) ?? getGarmentPieces(line.garment_type);
  const count = resolveFabricLineLabelCount(line);
  if (pieces.length > 1) {
    return `${count} labels (${pieces.join(" + ")})`;
  }
  return `${count} label${count !== 1 ? "s" : ""}`;
}
