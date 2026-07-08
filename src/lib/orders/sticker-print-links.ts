export type StickerSheetMode = "fabric-cuts" | "pieces";

export function orderStickerSheetHref(
  orderId: string,
  sheet: StickerSheetMode,
  options?: { po?: string; poId?: string; lineId?: string }
): string {
  const params = new URLSearchParams({ sheet });
  if (options?.po) params.set("po", options.po);
  if (options?.poId) params.set("po_id", options.poId);
  if (options?.lineId) params.set("line", options.lineId);
  return `/orders/${orderId}/stickers?${params.toString()}`;
}
