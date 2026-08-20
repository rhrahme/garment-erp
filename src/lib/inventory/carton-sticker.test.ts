import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCartonSticker,
  CARTON_STICKER_PRINT_CSS,
  formatCartonStickerDate,
} from "@/lib/inventory/carton-sticker";
import type { InventoryCarton, InventoryItem } from "@/lib/types/inventory";

const item: InventoryItem = {
  id: "inv-suit-hanger",
  name: "Suit hanger",
  category: "Hangers",
  brand: "Gliani",
  unit: "pcs",
  quantity_on_hand: 10,
  low_stock_threshold: 3,
  location: "Store room A",
  notes: "Black plastic, 45cm",
  created_at: "2026-08-16T00:00:00Z",
  updated_at: "2026-08-16T00:00:00Z",
};

const carton: InventoryCarton = {
  id: "ctn-1",
  item_id: "inv-suit-hanger",
  quantity: 200,
  status: "sealed",
  created_at: "2026-08-17T09:30:00Z",
  created_by: null,
  opened_at: null,
  opened_by: null,
};

describe("carton 4x6 box sticker", () => {
  it("prints one 4in x 6in label per box (not A4 multi-up)", () => {
    assert.match(CARTON_STICKER_PRINT_CSS, /@page\s*\{[^}]*size:\s*4in\s+6in/i);
    assert.doesNotMatch(CARTON_STICKER_PRINT_CSS, /size:\s*A4/i);
    assert.match(CARTON_STICKER_PRINT_CSS, /\.carton-sticker\s*\{[^}]*width:\s*4in/s);
    assert.match(CARTON_STICKER_PRINT_CSS, /\.carton-sticker\s*\{[^}]*height:\s*6in/s);
    assert.match(CARTON_STICKER_PRINT_CSS, /page-break-after:\s*always/);
    assert.doesNotMatch(CARTON_STICKER_PRINT_CSS, /grid-template-columns/);
  });

  it("does not shrink with transform/zoom or max-w wrappers", () => {
    assert.doesNotMatch(CARTON_STICKER_PRINT_CSS, /transform\s*:\s*scale\s*\(/i);
    assert.doesNotMatch(CARTON_STICKER_PRINT_CSS, /zoom\s*:/i);
    assert.match(CARTON_STICKER_PRINT_CSS, /transform:\s*none\s*!important/i);
    assert.match(CARTON_STICKER_PRINT_CSS, /html\s*\{[^}]*width:\s*100%\s*!important/s);
    assert.match(CARTON_STICKER_PRINT_CSS, /body\s*\{[^}]*width:\s*100%\s*!important/s);
    assert.match(CARTON_STICKER_PRINT_CSS, /\.carton-sticker-sheet\s*\{[^}]*max-width:\s*none\s*!important/s);
    assert.doesNotMatch(CARTON_STICKER_PRINT_CSS, /break-inside:\s*avoid-page/i);
  });

  it("keeps a large scannable QR and readable pt fonts", () => {
    assert.match(CARTON_STICKER_PRINT_CSS, /\.qr\s*\{[^}]*width:\s*1\.7in/s);
    assert.match(CARTON_STICKER_PRINT_CSS, /font-size:\s*18pt/);
    assert.match(CARTON_STICKER_PRINT_CSS, /font-size:\s*11pt/);
    assert.match(CARTON_STICKER_PRINT_CSS, /Helvetica,\s*Arial/);
  });

  it("shows item, brand, category, qty, location, notes, box id, date, and QR url", () => {
    const sticker = buildCartonSticker({
      carton,
      item,
      appUrl: "https://erp.hagan.pro/",
    });
    assert.equal(sticker.item_name, "Suit hanger");
    assert.equal(sticker.brand, "Gliani");
    assert.equal(sticker.category, "Hangers");
    assert.equal(sticker.quantity, 200);
    assert.equal(sticker.unit, "pcs");
    assert.equal(sticker.location, "Store room A");
    assert.equal(sticker.notes, "Black plastic, 45cm");
    assert.equal(sticker.carton_id, "ctn-1");
    assert.equal(sticker.registered_on, "2026-08-17");
    assert.equal(sticker.open_url, "https://erp.hagan.pro/inventory/cartons/ctn-1");
    assert.equal(sticker.photo_url, null);
  });

  it("prints the latest article photo when one was uploaded", () => {
    const sticker = buildCartonSticker({
      carton,
      item,
      appUrl: "https://erp.hagan.pro/",
      photoUrl: "/api/entity-images/inventory_item%3Ainv-suit-hanger/images/ei-1?v=1",
    });
    assert.equal(
      sticker.photo_url,
      "/api/entity-images/inventory_item%3Ainv-suit-hanger/images/ei-1?v=1"
    );
  });

  it("formats ISO dates as YYYY-MM-DD and drops empty ones", () => {
    assert.equal(formatCartonStickerDate("2026-08-17T09:30:00Z"), "2026-08-17");
    assert.equal(formatCartonStickerDate(null), "");
    assert.equal(formatCartonStickerDate("not-a-date"), "");
  });
});
