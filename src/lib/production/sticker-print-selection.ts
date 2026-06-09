import type { FabricLinePrintKind } from "@/lib/sales-orders/fabric-lines";
import type { PrintableStickerLabel, StickerRole } from "@/lib/production/qr-labels";

export type StickerPreviewItem = {
  label: PrintableStickerLabel & { qr_url?: string };
  role: StickerRole;
};

export type UnprintedStickerLineIds = {
  prep_stickers: string[];
  prod_stickers: string[];
};

/** Sticker codes for lines not yet printed — used as preview modal default selection. */
export function stickerCodesForUnprintedLines(
  items: StickerPreviewItem[],
  unprintedLineIds: UnprintedStickerLineIds
): string[] {
  const prepSet = new Set(unprintedLineIds.prep_stickers);
  const prodSet = new Set(unprintedLineIds.prod_stickers);

  return items
    .filter((item) => {
      const lineId = item.label.fabric_line_id;
      if (!lineId) return false;
      return item.role === "prep" ? prepSet.has(lineId) : prodSet.has(lineId);
    })
    .map((item) => item.label.sticker_code);
}

const PRINT_KIND_ROLE: Record<"prep_stickers" | "prod_stickers", StickerRole> = {
  prep_stickers: "prep",
  prod_stickers: "prod",
};

/** Line IDs to mark printed — only when every sticker for that line+kind was selected. */
export function lineIdsForStickerSelection(
  items: StickerPreviewItem[],
  selectedCodes: Set<string>,
  kind: Extract<FabricLinePrintKind, "prep_stickers" | "prod_stickers">
): string[] {
  const role = PRINT_KIND_ROLE[kind];
  const byLine = new Map<string, { total: number; selected: number }>();

  for (const item of items) {
    if (item.role !== role) continue;
    const lineId = item.label.fabric_line_id;
    if (!lineId) continue;
    const entry = byLine.get(lineId) ?? { total: 0, selected: 0 };
    entry.total += 1;
    if (selectedCodes.has(item.label.sticker_code)) entry.selected += 1;
    byLine.set(lineId, entry);
  }

  return [...byLine.entries()]
    .filter(([, counts]) => counts.selected > 0 && counts.selected === counts.total)
    .map(([lineId]) => lineId);
}

export function filterEntriesByStickerCodes<T extends { label: PrintableStickerLabel }>(
  entries: T[],
  codes: string[] | null | undefined
): T[] {
  if (!codes || codes.length === 0) return entries;
  const set = new Set(codes);
  return entries.filter((entry) => set.has(entry.label.sticker_code));
}
