import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

/** Total piece labels across all fabric lines (suit line = 2, shirt = 1). */
export function totalProductionLabels(lines: SalesOrderFabricLine[]): number {
  return lines.reduce(
    (sum, line) => sum + (line.label_stickers?.length ?? line.label_count ?? 1),
    0
  );
}

/** Human-readable label summary for one fabric line — e.g. "2 labels (Jacket + Trouser)". */
export function formatFabricLineLabels(line: SalesOrderFabricLine): string {
  const pieces = line.label_stickers?.map((sticker) => sticker.piece_name) ?? getGarmentPieces(line.garment_type);
  const count = line.label_stickers?.length ?? line.label_count ?? pieces.length;
  if (pieces.length > 1) {
    return `${count} labels (${pieces.join(" + ")})`;
  }
  return `${count} label${count !== 1 ? "s" : ""}`;
}
