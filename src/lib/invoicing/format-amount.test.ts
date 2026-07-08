import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatInvoiceDhsForPdf,
  formatInvoiceSar,
  formatInvoiceSarForPdf,
} from "./format-amount.ts";

describe("formatInvoiceSarForPdf", () => {
  it("omits thousands separators that break jspdf-autotable cells", () => {
    assert.equal(formatInvoiceSarForPdf(2100), "SAR 2100");
    assert.equal(formatInvoiceSarForPdf(147600.01), "SAR 147600.01");
    assert.equal(formatInvoiceDhsForPdf(80345.72), "80345.72 DHS");
  });

  it("keeps screen formatting with grouping", () => {
    assert.equal(formatInvoiceSar(2100), "SAR\u00a02,100");
  });
});
