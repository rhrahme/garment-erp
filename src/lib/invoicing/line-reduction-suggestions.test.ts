import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";
import { suggestSuitCombineGroups } from "./suit-combine-lines.ts";
import {
  applyAllInvoiceLineReductions,
  applyInvoiceLineReduction,
  detectInvoiceLineReductions,
  lineCountAfterReductions,
} from "./line-reduction-suggestions.ts";

function line(overrides: Partial<CustomerInvoiceLine> & Pick<CustomerInvoiceLine, "id">): CustomerInvoiceLine {
  return {
    article_number: 1,
    sales_order_line_id: null,
    description: "Jacket",
    garment_type: "Jacket",
    piece_name: "Blazers",
    sticker_code: null,
    fabric_number: null,
    fabric_brand: null,
    composition: "70% Wool, 20% Silk, 10% Linen",
    weight_gsm: null,
    quantity: 1,
    unit_price: 4500,
    line_total: 4500,
    cost_hint_sar: null,
    fabric_cost_hint_sar: null,
    ...overrides,
  };
}

/** Split suit rows on the same SO fabric line — pre-combine pattern. */
const splitSuitLines: CustomerInvoiceLine[] = [
  line({
    id: "suit-jkt",
    garment_type: "Suit",
    piece_name: "Jacket",
    description: "Suit (Jacket)",
    sales_order_line_id: "line-fabric-1",
    fabric_number: "10005.169/22",
    fabric_brand: "Canclini",
    unit_price: 1750,
    line_total: 1750,
    article_number: 1,
  }),
  line({
    id: "suit-tr",
    garment_type: "Suit",
    piece_name: "Trouser",
    description: "Suit (Trouser)",
    sales_order_line_id: "line-fabric-1",
    fabric_number: "10005.169/22",
    fabric_brand: "Canclini",
    unit_price: 1750,
    line_total: 1750,
    article_number: 2,
  }),
];

/** INV-2026-0003 — three matching shirts after suits are combined. */
const inv0003Shirts: CustomerInvoiceLine[] = [
  line({
    id: "shirt-a",
    garment_type: "Shirt LS",
    piece_name: "Shirt LS",
    description: "Shirt LS",
    composition: "100% cotton",
    fabric_brand: "Canclini",
    unit_price: 600,
    line_total: 600,
    article_number: 3,
  }),
  line({
    id: "shirt-b",
    garment_type: "Shirt LS",
    piece_name: "Shirt LS",
    description: "Shirt LS",
    composition: "100% cotton",
    fabric_brand: "Canclini",
    unit_price: 600,
    line_total: 600,
    article_number: 4,
  }),
  line({
    id: "shirt-c",
    garment_type: "Shirt LS",
    piece_name: "Shirt LS",
    description: "Shirt LS",
    composition: "100% cotton",
    fabric_brand: "Canclini",
    unit_price: 600,
    line_total: 600,
    article_number: 5,
  }),
];

const inv0003CombinedSuits: CustomerInvoiceLine[] = [
  line({
    id: "suit-1",
    garment_type: "Suit",
    piece_name: "Jacket + Trouser",
    description: "Suit (Jacket + Trouser)",
    sales_order_line_id: "line-fabric-1",
    unit_price: 3500,
    line_total: 3500,
    article_number: 1,
  }),
  line({
    id: "suit-2",
    garment_type: "Suit",
    piece_name: "Jacket + Trouser",
    description: "Suit (Jacket + Trouser)",
    sales_order_line_id: "line-fabric-2",
    unit_price: 3500,
    line_total: 3500,
    article_number: 2,
  }),
  ...inv0003Shirts,
];

/** INV-2026-0004 — already merged suit; must not suggest suit combine. */
const inv0004Lines: CustomerInvoiceLine[] = [
  line({
    id: "suit-merged",
    garment_type: "Suit",
    piece_name: "Jacket + Trouser",
    description: "Suit (Jacket + Trouser)",
    composition: "100% WV",
    weight_gsm: 260,
    quantity: 6,
    unit_price: 9000,
    line_total: 54000,
    article_number: 4,
    sales_order_line_id: "line-cu-86exexf56-18",
  }),
];

/** INV-2026-0005 — jacket + trouser on separate SO lines, same fabric. */
const inv0005SplitSuit: CustomerInvoiceLine[] = [
  line({
    id: "tr",
    garment_type: "Trouser",
    piece_name: "Trousers",
    description: "Trouser",
    sales_order_line_id: "line-cu-86exaff6e-1",
    fabric_number: "10015.210/2",
    fabric_brand: "Canclini",
    composition: "100% WV",
    unit_price: 0,
    line_total: 0,
    article_number: 1,
  }),
  line({
    id: "jkt",
    garment_type: "Jacket",
    piece_name: "Blazers",
    description: "Jacket",
    sales_order_line_id: "line-cu-86exaff6e-2",
    fabric_number: "10015.210/2",
    fabric_brand: "Canclini",
    composition: "100% WV",
    unit_price: 0,
    line_total: 0,
    article_number: 2,
  }),
];

/** INV-2026-0005 — duplicate shirt rows from repeated SO fabric entry. */
const inv0005ShirtDupes: CustomerInvoiceLine[] = [
  line({
    id: "shirt-good",
    garment_type: "Shirt LS",
    piece_name: "Shirt LS",
    description: "Shirt LS",
    sales_order_line_id: "line-1782644353237-4",
    fabric_number: "1415541-1",
    fabric_brand: "Canclini",
    composition: "100% cotton",
    sticker_code: "FR-0426-0007-SO-2026-0015-L04-SHT-LS",
    unit_price: 245.58,
    line_total: 245.58,
    cost_hint_sar: 245.58,
    fabric_cost_hint_sar: 25.58,
    article_number: 3,
  }),
  line({
    id: "shirt-dupe",
    garment_type: "Shirt LS",
    piece_name: "Shirt LS",
    description: "Shirt LS",
    sales_order_line_id: "line-1782644523158-4",
    fabric_number: "C1415541-1",
    fabric_brand: "Canclini",
    composition: null,
    sticker_code: "FR-0426-0007-SO-2026-0015-L04-SHT-LS",
    unit_price: 0,
    line_total: 0,
    article_number: 4,
  }),
];

const inv0005Lines: CustomerInvoiceLine[] = [...inv0005SplitSuit, ...inv0005ShirtDupes];

describe("detectInvoiceLineReductions", () => {
  it("detects split suit jacket + trouser on same sales order line", () => {
    const suggestions = detectInvoiceLineReductions(splitSuitLines);
    const suit = suggestions.find((row) => row.type === "combine_suit_pieces");
    assert.ok(suit);
    assert.equal(suit.from_line_count, 2);
    assert.equal(suit.to_line_count, 1);
    assert.match(suit.preview_description, /Suit \(Jacket \+ Trouser\)/);
  });

  it("detects shirt consolidation for INV-2026-0003 pattern", () => {
    const suggestions = detectInvoiceLineReductions(inv0003CombinedSuits);
    assert.equal(suggestions.some((row) => row.type === "combine_suit_pieces"), false);
    const shirts = suggestions.find((row) => row.type === "consolidate_shirts");
    assert.ok(shirts);
    assert.equal(shirts.from_line_count, 3);
    assert.equal(shirts.to_line_count, 1);
    assert.equal(lineCountAfterReductions(inv0003CombinedSuits.length, suggestions), 3);
  });

  it("detects full INV-2026-0003 reduction path (7 → 3 lines)", () => {
    const sevenLines = [
      ...splitSuitLines,
      ...splitSuitLines.map((row, index) => ({
        ...row,
        id: `${row.id}-b${index}`,
        sales_order_line_id: "line-fabric-2",
        article_number: row.article_number! + 2,
      })),
      ...inv0003Shirts,
    ];
    const suggestions = detectInvoiceLineReductions(sevenLines);
    assert.equal(lineCountAfterReductions(sevenLines.length, suggestions), 3);
    assert.equal(suggestions.filter((row) => row.type === "combine_suit_pieces").length, 2);
    assert.equal(suggestions.some((row) => row.type === "consolidate_shirts"), true);
  });

  it("does not suggest suit combine for INV-2026-0004 merged suit", () => {
    const suggestions = detectInvoiceLineReductions(inv0004Lines);
    assert.equal(suggestions.some((row) => row.type === "combine_suit_pieces"), false);
  });

  it("detects cross-fabric jacket + trouser for INV-2026-0005", () => {
    const suggestions = detectInvoiceLineReductions(inv0005SplitSuit);
    const crossSuit = suggestions.find((row) => row.type === "combine_cross_fabric_suit");
    assert.ok(crossSuit);
    assert.equal(crossSuit.from_line_count, 2);
    assert.match(crossSuit.preview_description, /Suit \(Jacket \+ Trouser\)/);
  });

  it("detects duplicate shirt lines for INV-2026-0005", () => {
    const suggestions = detectInvoiceLineReductions(inv0005ShirtDupes);
    const dupes = suggestions.find((row) => row.type === "remove_duplicate_lines");
    assert.ok(dupes);
    assert.equal(dupes.from_line_count, 2);
    assert.match(dupes.preview_description, /keep Shirt LS/);
  });

  it("detects full INV-2026-0005 reduction path (4 → 2 lines)", () => {
    const suggestions = detectInvoiceLineReductions(inv0005Lines);
    assert.equal(lineCountAfterReductions(inv0005Lines.length, suggestions), 2);
    assert.equal(suggestions.some((row) => row.type === "combine_cross_fabric_suit"), true);
    assert.equal(suggestions.some((row) => row.type === "remove_duplicate_lines"), true);
  });
});

describe("applyInvoiceLineReduction", () => {
  it("merges split suit pieces", () => {
    const suggestions = detectInvoiceLineReductions(splitSuitLines);
    const merged = applyInvoiceLineReduction(splitSuitLines, suggestions[0]!);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.piece_name, "Jacket + Trouser");
    assert.equal(merged[0]!.unit_price, 3500);
  });

  it("applyAllInvoiceLineReductions reduces 7-line invoice to 3", () => {
    const sevenLines = [
      ...splitSuitLines,
      ...splitSuitLines.map((row, index) => ({
        ...row,
        id: `${row.id}-dup${index}`,
        sales_order_line_id: "line-fabric-2",
      })),
      ...inv0003Shirts,
    ];
    const reduced = applyAllInvoiceLineReductions(sevenLines);
    assert.equal(reduced.length, 3);
    const shirtLine = reduced.find((row) => row.garment_type === "Shirt LS");
    assert.equal(shirtLine?.quantity, 3);
  });

  it("applyAllInvoiceLineReductions reduces INV-2026-0005 to 2 lines", () => {
    const reduced = applyAllInvoiceLineReductions(inv0005Lines);
    assert.equal(reduced.length, 2);
    const suitLine = reduced.find((row) => row.garment_type === "Suit");
    assert.ok(suitLine);
    assert.equal(suitLine.piece_name, "Jacket + Trouser");
    const shirtLine = reduced.find((row) => row.garment_type === "Shirt LS");
    assert.ok(shirtLine);
    assert.equal(shirtLine.id, "shirt-good");
    assert.equal(shirtLine.unit_price, 245.58);
  });
});

describe("suggestSuitCombineGroups", () => {
  it("groups by sales_order_line_id", () => {
    const groups = suggestSuitCombineGroups(splitSuitLines);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.line_ids.length, 2);
  });
});
