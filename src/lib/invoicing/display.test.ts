import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CustomerInvoiceLine } from "@/lib/types/customer-invoices";
import { resolveInvoiceGarmentDescription } from "@/lib/sales-orders/label-codes";
import {
  computeInvoiceLineTotals,
  countGarmentPiecesForLine,
  normalizeInvoiceLine,
  resolveInvoiceLines,
  toInvoiceLineDisplay,
} from "./display.ts";

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

  it("does not duplicate combo garment type (Shirt+Short)", () => {
    assert.equal(
      resolveInvoiceGarmentDescription("Shirt+Short", "Shirt + Short"),
      "Shirt + Short"
    );
  });

  it("does not duplicate 3-piece combo garment type (Shirt+Trouser+Short)", () => {
    assert.equal(
      resolveInvoiceGarmentDescription("Shirt+Trouser+Short", "Shirt + Trouser + Short"),
      "Shirt + Trouser + Short"
    );
  });

  it("keeps single garment descriptions unchanged", () => {
    assert.equal(resolveInvoiceGarmentDescription("Shirt LS", "Shirt LS"), "Shirt LS");
    assert.equal(resolveInvoiceGarmentDescription("Jacket", "Jacket"), "Jacket");
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

describe("countGarmentPiecesForLine", () => {
  it("counts single garment types as one piece", () => {
    assert.equal(countGarmentPiecesForLine({ garment_type: "Shirt LS", piece_name: "Shirt LS" }), 1);
    assert.equal(countGarmentPiecesForLine({ garment_type: "Jacket", piece_name: "Jacket" }), 1);
  });

  it("expands combo garment types into pieces", () => {
    assert.equal(countGarmentPiecesForLine({ garment_type: "Shirt+Short", piece_name: "Shirt + Short" }), 2);
    assert.equal(
      countGarmentPiecesForLine({ garment_type: "Shirt+Trouser+Short", piece_name: "Shirt + Trouser + Short" }),
      3
    );
    assert.equal(countGarmentPiecesForLine({ garment_type: "Overshirt+Trouser", piece_name: "Overshirt + Trouser" }), 2);
  });

  it("counts a jacket + trouser suit set as two pieces", () => {
    assert.equal(countGarmentPiecesForLine({ garment_type: "Trouser", piece_name: "Jacket + Trouser" }), 2);
  });

  it("falls back to combo type when piece_name is missing", () => {
    assert.equal(countGarmentPiecesForLine({ garment_type: "Shirt+Short", piece_name: null }), 2);
  });
});

describe("computeInvoiceLineTotals", () => {
  it("sums quantity and expands combo pieces × quantity", () => {
    const totals = computeInvoiceLineTotals([
      line({ id: "a", garment_type: "Shirt LS", piece_name: "Shirt LS", quantity: 2 }),
      line({ id: "b", garment_type: "Shirt+Short", piece_name: "Shirt + Short", quantity: 1 }),
      line({ id: "c", garment_type: "Shirt+Trouser+Short", piece_name: "Shirt + Trouser + Short", quantity: 1 }),
    ]);
    assert.equal(totals.lineCount, 3);
    assert.equal(totals.totalQuantity, 4);
    assert.equal(totals.totalGarmentItems, 7);
  });
});
