import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";
import {
  applyAllConsolidations,
  applyConsolidation,
  buildConsolidationMergeKey,
  renumberInvoiceArticles,
  suggestConsolidationGroups,
} from "./consolidate-lines.ts";
import { applyAllInvoiceLineReductions } from "./line-reduction-suggestions.ts";

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

  it("excludes unpriced lines that have no fibre or weight", () => {
    const unpriced = so0005Jackets.map((row) => ({ ...row, unit_price: 0, line_total: 0 }));
    assert.equal(suggestConsolidationGroups(unpriced).length, 0);
  });

  it("suggests merging unpriced lines that share garment, fibre, and gsm", () => {
    const unpriced = so0005Jackets.map((row) => ({
      ...row,
      unit_price: 0,
      line_total: 0,
      weight_gsm: 240,
    }));
    const groups = suggestConsolidationGroups(unpriced);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.merged.quantity, 2);
    assert.equal(groups[0]!.merged.unit_price, 0);
  });

  it("can ignore unit price so the same garment + fibre + gsm combine", () => {
    const mixed = [
      { ...so0005Jackets[0]!, weight_gsm: 240 },
      { ...so0005Jackets[1]!, unit_price: 5100, line_total: 5100, weight_gsm: 240 },
    ];
    assert.equal(suggestConsolidationGroups(mixed).length, 0);
    const groups = suggestConsolidationGroups(mixed, { ignoreUnitPrice: true });
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.lines.length, 2);
    assert.equal(groups[0]!.merged.unit_price, 0);
    assert.equal(groups[0]!.merged.quantity, 2);
  });

  it("treats mill collection names as the same fibre for merge", () => {
    const shirts = [
      line({
        id: "aloe",
        garment_type: "Shirt LS",
        piece_name: "Shirt LS",
        description: "Shirt LS",
        composition: "STREET LINO ALOE NEW 100% LINEN",
        weight_gsm: 195,
        unit_price: 0,
        line_total: 0,
      }),
      line({
        id: "delave",
        garment_type: "Shirt LS",
        piece_name: "Shirt LS",
        description: "Shirt LS",
        composition: "STREET LINO DELAVE' ALOE NEW 100% LINEN",
        weight_gsm: 195,
        unit_price: 0,
        line_total: 0,
        article_number: 2,
      }),
      line({
        id: "li",
        garment_type: "Shirt LS",
        piece_name: "Shirt LS",
        description: "Shirt LS",
        composition: "100% LI",
        weight_gsm: 195,
        unit_price: 0,
        line_total: 0,
        article_number: 3,
      }),
    ];
    const groups = suggestConsolidationGroups(shirts, { ignoreUnitPrice: true });
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.merged.quantity, 3);
  });

  it("combines combo garments with the same fibre and gsm across fabric lines", () => {
    const combos = [
      line({
        id: "os-1",
        garment_type: "Overshirt+Trouser",
        piece_name: "Overshirt + Trouser",
        description: "Overshirt + Trouser",
        sales_order_line_id: "line-a",
        fabric_number: "771001",
        composition: '71% WOOL 15% SILK 14% LINEN "SUMMERTIME"',
        weight_gsm: 250,
        unit_price: 0,
        line_total: 0,
      }),
      line({
        id: "os-2",
        garment_type: "Overshirt+Trouser",
        piece_name: "Overshirt + Trouser",
        description: "Overshirt + Trouser",
        sales_order_line_id: "line-b",
        fabric_number: "771002",
        composition: "71% wool 15% silk 14% linen",
        weight_gsm: 250,
        unit_price: 0,
        line_total: 0,
        article_number: 2,
      }),
    ];
    const groups = suggestConsolidationGroups(combos, { ignoreUnitPrice: true });
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.merged.quantity, 2);
  });

  it("keeps priced combo lines without gsm on separate fabric lines", () => {
    const suits = [
      line({
        id: "suit-a",
        garment_type: "Suit",
        piece_name: "Jacket + Trouser",
        description: "Suit (Jacket + Trouser)",
        sales_order_line_id: "line-fabric-1",
        unit_price: 3500,
        line_total: 3500,
      }),
      line({
        id: "suit-b",
        garment_type: "Suit",
        piece_name: "Jacket + Trouser",
        description: "Suit (Jacket + Trouser)",
        sales_order_line_id: "line-fabric-2",
        unit_price: 3500,
        line_total: 3500,
        article_number: 2,
      }),
    ];
    assert.equal(suggestConsolidationGroups(suits, { ignoreUnitPrice: true }).length, 0);
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

  it("never merges two different fabric brands", () => {
    const branded = [
      line({ id: "a", fabric_brand: "Stylbiella" }),
      line({ id: "b", fabric_brand: "Canclini", article_number: 2 }),
    ];
    assert.equal(suggestConsolidationGroups(branded).length, 0);
  });

  it("keeps brands apart even when garment, composition, weight and price match", () => {
    const sameCloth = [
      line({ id: "a", fabric_brand: "Zegna" }),
      line({ id: "b", fabric_brand: "Loro Piana", article_number: 2 }),
    ];
    const [first, second] = sameCloth;
    assert.notEqual(
      buildConsolidationMergeKey(first!),
      buildConsolidationMergeKey(second!),
      "a merged row prints one brand - two mills are two articles"
    );
    assert.equal(suggestConsolidationGroups(sameCloth).length, 0);
  });

  it("still merges the same brand", () => {
    const sameBrand = [
      line({ id: "a", fabric_brand: "Zegna" }),
      line({ id: "b", fabric_brand: "Zegna", article_number: 2 }),
    ];
    assert.equal(suggestConsolidationGroups(sameBrand).length, 1);
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

describe("mill and fabric cost in the merge key", () => {
  const trouser = (over: Partial<CustomerInvoiceLine> & Pick<CustomerInvoiceLine, "id">) =>
    line({
      description: "Trouser",
      garment_type: "Trouser",
      piece_name: "Trouser",
      composition: "71% Wool 15% Silk 14% Linen",
      weight_gsm: 250,
      unit_price: 0,
      line_total: 0,
      fabric_cost_hint_sar: 100,
      ...over,
    });

  it("keeps separate mills on separate lines", () => {
    const merged = applyAllInvoiceLineReductions([
      trouser({ id: "a", fabric_number: "771018", fabric_brand: "Loro Piana" }),
      trouser({ id: "b", fabric_number: "771019", fabric_brand: "Loro Piana" }),
      trouser({ id: "c", fabric_number: "64013", fabric_brand: "Zegna" }),
      trouser({ id: "d", fabric_number: "BEY 008", fabric_brand: "Canclini" }),
    ]);
    assert.equal(merged.length, 3);
    const brands = merged.map((row) => row.fabric_brand).sort();
    assert.deepEqual(brands, ["Canclini", "Loro Piana", "Zegna"]);
    const loroPiana = merged.find((row) => row.fabric_brand === "Loro Piana");
    assert.equal(loroPiana?.quantity, 2);
  });

  it("keeps a different fabric cost on its own line", () => {
    const merged = applyAllInvoiceLineReductions([
      trouser({ id: "a", fabric_number: "771018", fabric_brand: "Loro Piana" }),
      trouser({ id: "b", fabric_number: "771020", fabric_brand: "Loro Piana", fabric_cost_hint_sar: 999 }),
    ]);
    assert.equal(merged.length, 2);
  });

  it("never zeroes a price by merging rows that disagree on it", () => {
    const merged = applyAllInvoiceLineReductions([
      trouser({ id: "a", fabric_brand: "Loro Piana", unit_price: 120, line_total: 120 }),
      trouser({ id: "b", fabric_brand: "Loro Piana", unit_price: 0, line_total: 0 }),
    ]);
    assert.equal(merged.length, 2);
    assert.ok(merged.some((row) => row.unit_price === 120));
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
