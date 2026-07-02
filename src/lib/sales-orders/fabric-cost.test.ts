import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fabricLineSupplierTotal,
  formatFabricCostHint,
  formatFabricCostSummary,
  getFabricCostSummary,
} from "./fabric-cost.ts";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

function line(overrides: Partial<SalesOrderFabricLine> = {}): SalesOrderFabricLine {
  return {
    id: "line-1",
    garment_type: "Jacket",
    label_count: 1,
    label_stickers: [],
    supplier_id: "loro-piana",
    supplier_name: "Loro Piana",
    fabric_number: "123",
    quantity: 2.5,
    unit: "meters",
    unit_price: 100,
    composition: null,
    weight_gsm: null,
    width_cm: null,
    width_inches: null,
    color: null,
    ...overrides,
  };
}

describe("fabricLineSupplierTotal", () => {
  it("returns unit_price × quantity when price is positive", () => {
    assert.equal(fabricLineSupplierTotal(line({ unit_price: 48.5, quantity: 3 })), 145.5);
  });

  it("returns null when unit_price is zero or missing", () => {
    assert.equal(fabricLineSupplierTotal(line({ unit_price: 0 })), null);
    assert.equal(fabricLineSupplierTotal(line({ unit_price: null as unknown as number })), null);
  });

  it("works for kg units the same way", () => {
    assert.equal(fabricLineSupplierTotal(line({ unit: "kg", quantity: 1.2, unit_price: 50 })), 60);
  });
});

describe("getFabricCostSummary", () => {
  it("sums priced lines and ignores missing prices", () => {
    const summary = getFabricCostSummary([
      line({ id: "a", unit_price: 100, quantity: 2 }),
      line({ id: "b", unit_price: 0, quantity: 1 }),
      line({ id: "c", unit_price: 50, quantity: 1 }),
    ]);

    assert.equal(summary.priced_line_count, 2);
    assert.equal(summary.missing_price_line_count, 1);
    assert.equal(summary.totals_by_currency.EUR, 250);
    assert.equal(summary.total_sar, 1125);
  });

  it("converts mixed supplier currencies to SAR", () => {
    const summary = getFabricCostSummary([
      line({ id: "eur", supplier_id: "loro-piana", unit_price: 10, quantity: 1 }),
      line({ id: "usd", supplier_id: "zegna", unit_price: 10, quantity: 1 }),
    ]);

    assert.equal(summary.totals_by_currency.EUR, 10);
    assert.equal(summary.totals_by_currency.USD, 10);
    assert.equal(summary.total_sar, 82.5);
  });
});

describe("formatFabricCostSummary", () => {
  it("shows supplier currency and SAR when single currency", () => {
    const summary = getFabricCostSummary([line({ unit_price: 100, quantity: 1 })]);
    assert.equal(formatFabricCostSummary(summary), "€100.00 · SAR 450.00");
  });

  it("shows only SAR when currencies are mixed", () => {
    const summary = getFabricCostSummary([
      line({ id: "eur", supplier_id: "loro-piana", unit_price: 10, quantity: 1 }),
      line({ id: "usd", supplier_id: "zegna", unit_price: 10, quantity: 1 }),
    ]);
    assert.equal(formatFabricCostSummary(summary), "SAR 82.50");
  });

  it("shows zero SAR when no lines have prices", () => {
    const summary = getFabricCostSummary([line({ unit_price: 0 }), line({ id: "b", unit_price: 0 })]);
    assert.equal(formatFabricCostSummary(summary), "SAR 0.00");
  });
});

describe("formatFabricCostHint", () => {
  it("returns null when all lines are priced", () => {
    const summary = getFabricCostSummary([line()]);
    assert.equal(formatFabricCostHint(summary), null);
  });

  it("notes when every line is missing a price", () => {
    const summary = getFabricCostSummary([line({ unit_price: 0 }), line({ id: "b", unit_price: 0 })]);
    assert.equal(
      formatFabricCostHint(summary),
      "No supplier prices found — fill Price on lines or check supplier catalogs"
    );
  });

  it("notes missing priced lines", () => {
    const summary = getFabricCostSummary([line(), line({ id: "b", unit_price: 0 })]);
    assert.equal(formatFabricCostHint(summary), "1 line without price (from line or catalog)");
  });
});
