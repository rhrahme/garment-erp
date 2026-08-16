import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeGarmentInventoryDeduction,
  findGarmentRecipe,
} from "@/lib/data/inventory-store";
import type { InventoryStoreFile } from "@/lib/types/inventory";

function store(): InventoryStoreFile {
  return {
    updated_at: null,
    items: [
      {
        id: "inv-suit-hanger",
        name: "Suit hanger",
        category: "Hangers",
        unit: "pcs",
        quantity_on_hand: 10,
        low_stock_threshold: 3,
        location: null,
        notes: null,
        created_at: "2026-08-16T00:00:00Z",
        updated_at: "2026-08-16T00:00:00Z",
      },
      {
        id: "inv-laundry-hanger",
        name: "Laundry hanger",
        category: "Hangers",
        unit: "pcs",
        quantity_on_hand: 2,
        low_stock_threshold: 5,
        location: null,
        notes: null,
        created_at: "2026-08-16T00:00:00Z",
        updated_at: "2026-08-16T00:00:00Z",
      },
    ],
    recipes: [
      {
        garment_type: "Suit",
        lines: [{ item_id: "inv-suit-hanger", quantity_per_garment: 1 }],
        updated_at: "2026-08-16T00:00:00Z",
        updated_by: null,
      },
      {
        garment_type: "Shirt LS",
        lines: [{ item_id: "inv-laundry-hanger", quantity_per_garment: 1 }],
        updated_at: "2026-08-16T00:00:00Z",
        updated_by: null,
      },
      {
        garment_type: "Shirt+Trouser",
        lines: [
          { item_id: "inv-laundry-hanger", quantity_per_garment: 1 },
          { item_id: "inv-suit-hanger", quantity_per_garment: 1 },
        ],
        updated_at: "2026-08-16T00:00:00Z",
        updated_by: null,
      },
    ],
    ledger: [],
  };
}

test("packing a Suit deducts one suit hanger", () => {
  const s = store();
  const result = computeGarmentInventoryDeduction(s, {
    garmentType: "Suit",
    salesOrderLineId: "line-1",
    soNumber: "SO-2026-0001",
  });
  assert.equal(result.deducted, true);
  assert.equal(s.items[0]!.quantity_on_hand, 9);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]!.reason, "garment_packed");
  assert.equal(result.entries[0]!.sales_order_line_id, "line-1");
});

test("a Suit set never deducts twice for the same order line (piece rescans)", () => {
  const s = store();
  // Jacket piece packed, then trouser piece packed - same fabric line.
  computeGarmentInventoryDeduction(s, { garmentType: "Suit", salesOrderLineId: "line-1" });
  const second = computeGarmentInventoryDeduction(s, {
    garmentType: "Suit",
    salesOrderLineId: "line-1",
  });
  assert.equal(second.deducted, false);
  assert.equal(second.skipped_reason, "already_deducted");
  assert.equal(s.items[0]!.quantity_on_hand, 9);
});

test("two different order lines deduct independently", () => {
  const s = store();
  computeGarmentInventoryDeduction(s, { garmentType: "Suit", salesOrderLineId: "line-1" });
  computeGarmentInventoryDeduction(s, { garmentType: "Suit", salesOrderLineId: "line-2" });
  assert.equal(s.items[0]!.quantity_on_hand, 8);
});

test("garment type matching is case-insensitive and a missing recipe is skipped", () => {
  const s = store();
  assert.ok(findGarmentRecipe(s, "suit"));
  assert.ok(findGarmentRecipe(s, "SUIT "));
  const result = computeGarmentInventoryDeduction(s, {
    garmentType: "Thobe",
    salesOrderLineId: "line-9",
  });
  assert.equal(result.deducted, false);
  assert.equal(result.skipped_reason, "no_recipe");
});

test("a set recipe deducts both hangers and reports low stock", () => {
  const s = store();
  const result = computeGarmentInventoryDeduction(s, {
    garmentType: "Shirt+Trouser",
    salesOrderLineId: "line-3",
  });
  assert.equal(result.deducted, true);
  assert.equal(result.entries.length, 2);
  assert.equal(s.items[1]!.quantity_on_hand, 1); // laundry: 2 -> 1
  // Laundry hanger was already at/below threshold - must be flagged.
  assert.ok(result.low_stock_items.some((item) => item.id === "inv-laundry-hanger"));
});

test("stock can go negative (shelf/system mismatch stays visible)", () => {
  const s = store();
  s.items[1]!.quantity_on_hand = 0;
  const result = computeGarmentInventoryDeduction(s, {
    garmentType: "Shirt LS",
    salesOrderLineId: "line-4",
  });
  assert.equal(result.deducted, true);
  assert.equal(s.items[1]!.quantity_on_hand, -1);
});
