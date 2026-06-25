import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAUDI_VAT_RATE, resolveInvoiceVatRate } from "./vat.ts";

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Mirrors recalculateInvoiceTotals — prices are excl. VAT; VAT is added on subtotal. */
function calcSaudiInvoiceTotals(subtotal: number) {
  const vat_amount = roundMoney(subtotal * SAUDI_VAT_RATE);
  const total = roundMoney(subtotal + vat_amount);
  return { subtotal, vat_amount, total };
}

describe("resolveInvoiceVatRate", () => {
  it("returns 15% for Riyadh (RUH) deliveries", () => {
    assert.equal(resolveInvoiceVatRate("RUH"), SAUDI_VAT_RATE);
    assert.equal(resolveInvoiceVatRate("RUH"), 0.15);
  });

  it("returns null for Dubai (DXB) deliveries", () => {
    assert.equal(resolveInvoiceVatRate("DXB"), null);
  });

  it("returns null when destination is unknown", () => {
    assert.equal(resolveInvoiceVatRate(null), null);
    assert.equal(resolveInvoiceVatRate(undefined), null);
  });
});

describe("Saudi invoice totals (excl. VAT line prices)", () => {
  it("adds 15% VAT on subtotal — INV-2026-0003 pattern", () => {
    const totals = calcSaudiInvoiceTotals(8800);
    assert.equal(totals.vat_amount, 1320);
    assert.equal(totals.total, 10120);
  });

  it("rounds VAT to two decimal places — INV-2026-0001 pattern", () => {
    const totals = calcSaudiInvoiceTotals(877.56);
    assert.equal(totals.vat_amount, 131.63);
    assert.equal(totals.total, 1009.19);
  });
});
