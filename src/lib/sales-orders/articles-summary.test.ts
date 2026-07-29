import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSalesOrderArticlesSummary } from "@/lib/sales-orders/articles-summary";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

function line(partial: Partial<SalesOrderFabricLine> & Pick<SalesOrderFabricLine, "id">): SalesOrderFabricLine {
  return {
    garment_type: "Jacket",
    label_count: 1,
    label_stickers: [{ code: "FR-0126-0001-SO-2026-0001-L01-JKT", piece_name: "Jacket", sequence: 1 }],
    supplier_id: "loro-piana",
    supplier_name: "Loro Piana",
    fabric_number: "123456",
    quantity: 2.5,
    unit: "meters",
    unit_price: 0,
    composition: null,
    weight_gsm: 280,
    width_cm: 150,
    width_inches: null,
    color: null,
    ...partial,
  };
}

describe("buildSalesOrderArticlesSummary", () => {
  it("sorts lines by article number and aggregates by garment and supplier", () => {
    const lines = [
      line({
        id: "b",
        garment_type: "Shirt LS",
        label_stickers: [{ code: "FR-0126-0001-SO-2026-0001-L02-SHT-LS", piece_name: "Shirt LS", sequence: 1 }],
        quantity: 1.8,
      }),
      line({ id: "a", quantity: 2.5 }),
    ];

    const summary = buildSalesOrderArticlesSummary(lines);

    assert.equal(summary.line_count, 2);
    assert.equal(summary.total_meters, 4.3);
    assert.deepEqual(
      summary.lines.map((row) => row.article_label),
      ["L01", "L02"]
    );
    assert.equal(summary.by_garment.length, 2);
    assert.equal(summary.by_garment[0]?.label, "Jacket");
    assert.equal(summary.by_garment[0]?.total_meters, 2.5);
    assert.equal(summary.by_supplier[0]?.line_count, 2);
  });
});
