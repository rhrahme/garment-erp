import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";
import { resolveInvoiceGarmentDescription } from "@/lib/sales-orders/label-codes";
import { normalizeInvoiceLine, resolveInvoiceLines, toInvoiceLineDisplay } from "./display.ts";

function line(overrides: Partial<CustomerInvoiceLine> & Pick<CustomerInvoiceLine, "id">): CustomerInvoiceLine {
  return {
    article_number: 1,
    sales_order_line_id: null,
    description: "Trouser (Jacket + Trouser)",
    garment_type: "Trouser",
    piece_name: "Jacket + Trouser",
    sticker_code: null,
    fabric_number: null,
    fabric_brand: null,
    composition: "100% WV",
    weight_gsm: null,
    quantity: 1,
    unit_price: 7500,
    line_total: 7500,
    cost_hint_sar: null,
    fabric_cost_hint_sar: null,
    ...overrides,
  };
}

describe("resolveInvoiceGarmentDescription", () => {
  it("uses Suit for Trouser garment_type with Jacket + Trouser piece_name", () => {
    assert.equal(
      resolveInvoiceGarmentDescription("Trouser", "Jacket + Trouser"),
      "Suit (Jacket + Trouser)"
    );
  });
});

describe("toInvoiceLineDisplay", () => {
  it("shows Suit (Jacket + Trouser) when stored line has Trouser garment_type", () => {
    const display = toInvoiceLineDisplay(line({ id: "suit-cross-fabric" }));
    assert.equal(display.description, "Suit (Jacket + Trouser)");
  });
});

describe("normalizeInvoiceLine", () => {
  it("rewrites Trouser garment_type to Suit for jacket + trouser piece_name", () => {
    const normalized = normalizeInvoiceLine(line({ id: "suit-normalize" }));
    assert.equal(normalized.garment_type, "Suit");
    assert.equal(normalized.description, "Suit (Jacket + Trouser)");
  });
});

describe("resolveInvoiceLines", () => {
  it("normalizes all lines in a batch", () => {
    const [normalized] = resolveInvoiceLines([line({ id: "batch-suit" })]);
    assert.equal(normalized!.garment_type, "Suit");
    assert.equal(normalized!.description, "Suit (Jacket + Trouser)");
  });
});
