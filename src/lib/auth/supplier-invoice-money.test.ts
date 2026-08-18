import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactSupplierInvoiceMoney, supplierInvoiceForSession } from "./supplier-invoice-money.ts";
import type { SupplierInvoiceMoneyRow } from "./supplier-invoice-money.ts";

const invoice = {
  id: "si-1",
  supplier_id: "loro-piana",
  supplier_name: "Loro Piana",
  invoice_number: "LP-100",
  po_number: "PO-1",
  amount: "1200.00",
  currency: "EUR",
  transporter_invoices: [
    {
      id: "ti-1",
      amount: "350.00",
      currency: "SAR",
    },
  ],
  customs_summary: {
    status: "payment_due",
    status_label: "Payment due",
    amount_due: "350.00",
    amount_paid: null,
    currency: "SAR",
    payment_url: "https://example.com/pay",
  },
} as unknown as SupplierInvoiceMoneyRow;

describe("redactSupplierInvoiceMoney", () => {
  it("strips supplier, transporter, and customs amounts", () => {
    const redacted = redactSupplierInvoiceMoney(invoice);
    assert.equal(redacted.amount, null);
    assert.equal(redacted.transporter_invoices?.[0]?.amount, null);
    assert.equal(redacted.customs_summary?.amount_due, null);
    assert.equal(redacted.customs_summary?.status, "payment_due");
    assert.equal(redacted.invoice_number, "LP-100");
  });
});

describe("supplierInvoiceForSession", () => {
  it("keeps amounts for admin only", () => {
    assert.equal(supplierInvoiceForSession({ isAdmin: true }, invoice).amount, "1200.00");
    assert.equal(supplierInvoiceForSession({ isAdmin: false }, invoice).amount, null);
  });
});
