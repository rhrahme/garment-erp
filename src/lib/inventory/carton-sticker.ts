import type { InventoryCarton, InventoryItem } from "@/lib/types/inventory";

/**
 * One printed box sticker. Owner: glue a 4x6 inch label on each carton
 * with every useful detail plus a QR that opens the box.
 */
export type CartonStickerData = {
  carton_id: string;
  status: "sealed" | "opened";
  quantity: number;
  unit: string;
  item_name: string;
  brand: string | null;
  category: string | null;
  location: string | null;
  notes: string | null;
  registered_on: string;
  open_url: string;
  /** Latest article photo, if Cherry / inventory uploaded one. */
  photo_url: string | null;
};

export function formatCartonStickerDate(iso: string | null | undefined): string {
  const day = (iso ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
}

export function buildCartonSticker(input: {
  carton: InventoryCarton;
  item: InventoryItem | undefined;
  appUrl: string;
  photoUrl?: string | null;
}): CartonStickerData {
  const base = input.appUrl.replace(/\/$/, "");
  return {
    carton_id: input.carton.id,
    status: input.carton.status,
    quantity: input.carton.quantity,
    unit: input.item?.unit ?? "pcs",
    item_name: input.item?.name ?? input.carton.item_id,
    brand: input.item?.brand?.trim() || null,
    category: input.item?.category?.trim() || null,
    location: input.item?.location?.trim() || null,
    notes: input.item?.notes?.trim() || null,
    registered_on: formatCartonStickerDate(input.carton.created_at),
    open_url: `${base}/inventory/cartons/${encodeURIComponent(input.carton.id)}`,
    photo_url: input.photoUrl?.trim() || null,
  };
}

/**
 * 4x6 inch box sticker (one label per page). Same print invariants as
 * KNOWLEDGE Printing: Helvetica/Arial, pt fonts, no transform/zoom,
 * no max-w wrappers, html/body width 100%.
 */
export const CARTON_STICKER_PRINT_CSS = `
@page { size: 4in 6in; margin: 0; }
.carton-sticker-sheet {
  font-family: Helvetica, Arial, sans-serif;
  color: #000;
  width: 100%;
}
.carton-sticker {
  box-sizing: border-box;
  width: 4in;
  height: 6in;
  padding: 0.22in;
  border: 1.5pt solid #000;
  page-break-after: always;
  overflow: hidden;
}
.carton-sticker:last-child { page-break-after: auto; }
.carton-sticker .kicker {
  font-size: 9pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.carton-sticker .item {
  font-size: 18pt;
  font-weight: 700;
  line-height: 1.15;
  margin-top: 3mm;
}
.carton-sticker .qr-wrap { text-align: center; margin-top: 4mm; }
.carton-sticker .media {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.12in;
  margin-top: 4mm;
}
.carton-sticker .photo {
  width: 1.4in;
  height: 1.4in;
  object-fit: cover;
  border: 0.75pt solid #000;
}
.carton-sticker .qr { width: 1.7in; height: 1.7in; }
.carton-sticker .media .qr { width: 1.5in; height: 1.5in; }
.carton-sticker .qty {
  font-size: 16pt;
  font-weight: 700;
  text-align: center;
  margin-top: 3mm;
}
.carton-sticker .row {
  font-size: 11pt;
  line-height: 1.35;
  margin-top: 1.6mm;
}
.carton-sticker .lab { font-weight: 700; }
.carton-sticker .hint {
  font-size: 10pt;
  line-height: 1.3;
  margin-top: 4mm;
}
.carton-sticker .code {
  font-size: 9pt;
  margin-top: 2mm;
  word-break: break-all;
}
@media screen {
  .carton-sticker-sheet { padding: 16px; }
  .carton-sticker { margin-bottom: 16px; }
}
@media print {
  .screen-only { display: none !important; }
  html {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
  }
  body {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    background: white !important;
    transform: none !important;
  }
  .min-h-screen { min-height: 0 !important; height: auto !important; }
  .carton-sticker-sheet {
    padding: 0 !important;
    width: 100% !important;
    max-width: none !important;
  }
  .carton-sticker {
    width: 4in;
    height: 6in;
    margin: 0;
  }
}
`;
