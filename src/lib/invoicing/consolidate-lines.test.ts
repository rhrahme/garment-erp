import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";
import {
  applyAllConsolidations,
  applyConsolidation,
  renumberInvoiceArticles,
  suggestConsolidationGroups,
} from "./consolidate-lines.ts";

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

/** SO-2026-0005 pattern — two jackets, same composition, different fabric numbers. */
const so0005Jackets: CustomerInvoiceLine[] = [
  line({
    id: "jkt-a",
    article_number: 3,
    fabric_number: "50777/206",
    sticker_code: "GL-0526-0002-SO-2026-0005-L03-JKT",
  }),
  line({
    id: "jkt-b",
    article_number: 4,
    fabric_number: "50799/206",
    sticker_code: "GL-0526-0002-SO-2026-0005-L04-JKT",
  }),
];

/** INV-2026-0004-shaped suit line — already combined jacket + trouser. */
const inv0004Suit = line({
  id: "suit-merged",
  garment_type: "Suit",
  piece_name: "Jacket + Trouser",
  description: "Suit (Jacket + Trouser)",
  composition: "100% WV",
  weight_gsm: 260,
  quantity: 6,
  unit_price: 9000,
  line_total: 54000,
  cost_hint_sar: 7664.88,
});

describe("suggestConsolidationGroups", () => {
  it("suggests merging two priced jackets with matching keys", () => {
    const groups = suggestConsolidationGroups(so0005Jackets);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.lines.length, 2);
    assert.equal(groups[0]!.merged.quantity, 2);
    assert.equal(groups[0]!.merged.line_total, 9000);
  });

  it("excludes unpriced lines from suggestions", () => {
    const unpriced = so0005Jackets.map((row) => ({ ...row, unit_price: 0, line_total: 0 }));
    assert.equal(suggestConsolidationGroups(unpriced).length, 0);
  });

  it("does not split INV-0004-style combined suit lines", () => {
    const groups = suggestConsolidationGroups([
      inv0004Suit,
      line({
        id: "suit-dup",
        garment_type: "Suit",
        piece_name: "Jacket + Trouser",
        description: "Suit (Jacket + Trouser)",
        composition: "100% WV",
        weight_gsm: 260,
        unit_price: 9000,
        line_total: 9000,
        quantity: 1,
        article_number: 5,
      }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.merged.quantity, 7);
  });

  it("keeps different fabric brands separate when includeFabricBrand is on", () => {
    const branded = [
      line({ id: "a", fabric_brand: "Stylbiella" }),
      line({ id: "b", fabric_brand: "Canclini", article_number: 2 }),
    ];
    assert.equal(suggestConsolidationGroups(branded).length, 1);
    assert.equal(suggestConsolidationGroups(branded, { includeFabricBrand: true }).length, 0);
  });
});

describe("applyConsolidation", () => {
  it("merges a group and renumbers articles", () => {
    const groups = suggestConsolidationGroups(so0005Jackets);
    const merged = applyConsolidation(
      [...so0005Jackets, line({ id: "shirt", garment_type: "Shirt LS", description: "Shirt LS", article_number: 2 })],
      [groups[0]!.key]
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[0]!.article_number, 1);
    assert.equal(merged[1]!.article_number, 2);
    assert.equal(merged.find((row) => row.id === "jkt-a")!.quantity, 2);
    assert.equal(merged.find((row) => row.id === "jkt-a")!.fabric_number, null);
  });

  it("applyAllConsolidations matches suggest + apply", () => {
    const all = applyAllConsolidations(so0005Jackets);
    assert.equal(all.length, 1);
    assert.equal(all[0]!.quantity, 2);
  });
});

describe("renumberInvoiceArticles", () => {
  it("assigns article_number 1..N in article order", () => {
    const renumbered = renumberInvoiceArticles([
      line({ id: "c", article_number: 9 }),
      line({ id: "a", article_number: 1 }),
      line({ id: "b", article_number: 3 }),
    ]);
    assert.deepEqual(
      renumbered.map((row) => row.article_number),
      [1, 2, 3]
    );
  });
});
