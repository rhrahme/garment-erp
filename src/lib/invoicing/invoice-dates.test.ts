import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  invoiceDateFromCoveredOrders,
  oldestCalendarDate,
  withOldestCoveredInvoiceDate,
} from "./invoice-dates.ts";
import type { CustomerInvoice } from "@/lib/types/customer-invoices";

describe("oldestCalendarDate", () => {
  it("picks the earliest calendar day from mixed invoice and order dates", () => {
    assert.equal(
      oldestCalendarDate("2026-09-11", "2026-07-15T09:00:00.000Z", "2026-08-01"),
      "2026-07-15"
    );
    assert.equal(oldestCalendarDate(null, "", undefined), undefined);
    assert.equal(invoiceDateFromCoveredOrders("2026-09-11", ["2026-07-15", "2026-08-01"]), "2026-07-15");
    assert.equal(invoiceDateFromCoveredOrders("2026-06-01", ["2026-07-15"]), "2026-06-01");
  });

  it("rewrites a combined draft to the oldest covered order date", () => {
    const invoice = {
      invoice_date: "2026-09-11",
      due_date: "2026-10-11",
      payment_terms: "Net 30",
    } as CustomerInvoice;
    const next = withOldestCoveredInvoiceDate(invoice, ["2026-08-01", "2026-07-15"]);
    assert.equal(next.invoice_date, "2026-07-15");
    assert.equal(next.due_date, "2026-08-14");
    assert.equal(withOldestCoveredInvoiceDate(invoice, ["2026-09-11"]), invoice);
  });
});
