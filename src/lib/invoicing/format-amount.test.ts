import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatInvoiceDhsForPdf,
  formatInvoiceSar,
  formatInvoiceSarForPdf,
} from "./format-amount.ts";

describe("formatInvoiceSarForPdf", () => {
  it("uses plain-ASCII comma thousands separators", () => {
    assert.equal(formatInvoiceSarForPdf(2100), "SAR 2,100");
    assert.equal(formatInvoiceSarForPdf(147600.01), "SAR 147,600.01");
    assert.equal(formatInvoiceSarForPdf(1234567.89), "SAR 1,234,567.89");
    assert.equal(formatInvoiceDhsForPdf(80345.72), "80,345.72 DHS");
    // Fractional amounts always keep 2 decimals (no lonely single decimal).
    assert.equal(formatInvoiceDhsForPdf(133300.7), "133,300.70 DHS");
  });

  it("does not emit non-breaking spaces (jspdf renders NBSP poorly)", () => {
    assert.ok(!formatInvoiceSarForPdf(2100).includes("\u00a0"));
    assert.ok(!formatInvoiceDhsForPdf(2100).includes("\u00a0"));
  });

  it("keeps screen formatting with grouping", () => {
    assert.equal(formatInvoiceSar(2100), "SAR\u00a02,100");
  });
});
