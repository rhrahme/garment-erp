import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerInvoiceForSession,
  invoiceableOrderForSession,
  redactCustomerInvoiceMoney,
  redactCustomerInvoiceSummary,
} from "./invoice-cost-access.ts";
import type { CustomerInvoice, CustomerInvoiceSummary } from "@/lib/types/customer-invoices";
import type { InvoiceableSalesOrder } from "@/lib/types/invoiceable-orders";

const invoice: CustomerInvoice = {
  id: "inv-1",
  invoice_number: "INV-2026-0001",
  sales_order_id: "so-1",
  so_number: "SO-2026-0001",
  client_id: "client-1",
  client_code: "GL-0001",
  client_name: "Test Client",
  client_reference: null,
  client_email: null,
  client_address: null,
  payment_terms: "Net 30",
  currency: "SAR",
  status: "sent",
  invoice_date: "2026-08-01",
  due_date: "2026-08-31",
  lines: [
    {
      id: "line-1",
      article_number: 1,
      sales_order_line_id: "sol-1",
      description: "Jacket",
      garment_type: "Jacket",
      piece_name: "Jacket",
      sticker_code: null,
      fabric_number: "781050",
      fabric_brand: "Loro Piana",
      composition: "Wool",
      weight_gsm: 260,
      quantity: 1,
      unit_price: 2100,
      line_total: 2100,
      cost_hint_sar: 900,
      fabric_cost_hint_sar: 700,
    },
  ],
  subtotal: 2100,
  vat_rate: 0.15,
  vat_amount: 315,
  total: 2415,
  notes: null,
  created_at: "2026-08-01T00:00:00.000Z",
  sent_at: "2026-08-01T00:00:00.000Z",
  paid_at: null,
  payments: [
    {
      id: "pay-1",
      amount: 500,
      paid_at: "2026-08-02",
      method: "transfer",
      notes: "Deposit",
      recorded_at: "2026-08-02T00:00:00.000Z",
      recorded_by: "admin@example.com",
    },
  ],
  factory_brand_name: "Hagan",
  total_cost_sar: 900,
  delivery_destination: "RUH",
};

const summary: CustomerInvoiceSummary = {
  invoice_count: 1,
  draft_count: 0,
  sent_count: 1,
  paid_count: 0,
  outstanding_sar: 1915,
  paid_sar: 500,
};

const invoiceable: InvoiceableSalesOrder = {
  id: "so-1",
  so_number: "SO-2026-0001",
  client_name: "Test Client",
  client_code: "GL-0001",
  order_date: "2026-08-01",
  status: "in_production",
  piece_count: 1,
  fabric_line_count: 1,
  estimated_cost_sar: 900,
};

describe("redactCustomerInvoiceMoney", () => {
  it("strips selling amounts, costs, and payment amounts", () => {
    const redacted = redactCustomerInvoiceMoney(invoice);
    assert.equal(redacted.subtotal, 0);
    assert.equal(redacted.vat_amount, 0);
    assert.equal(redacted.total, 0);
    assert.equal(redacted.total_cost_sar, null);
    assert.equal(redacted.lines[0]?.unit_price, 0);
    assert.equal(redacted.lines[0]?.line_total, 0);
    assert.equal(redacted.lines[0]?.cost_hint_sar, null);
    assert.equal(redacted.payments[0]?.amount, 0);
    assert.equal(redacted.invoice_number, "INV-2026-0001");
    assert.equal(redacted.lines[0]?.description, "Jacket");
  });
});

describe("customerInvoiceForSession", () => {
  it("keeps amounts for admin and redacts everyone else", () => {
    assert.equal(customerInvoiceForSession({ isAdmin: true }, invoice).total, 2415);
    assert.equal(customerInvoiceForSession({ isAdmin: false }, invoice).total, 0);
    assert.equal(customerInvoiceForSession({ isAdmin: false }, invoice).lines[0]?.unit_price, 0);
  });
});

describe("redactCustomerInvoiceSummary", () => {
  it("keeps counts and zeros money", () => {
    const redacted = redactCustomerInvoiceSummary(summary);
    assert.equal(redacted.invoice_count, 1);
    assert.equal(redacted.sent_count, 1);
    assert.equal(redacted.outstanding_sar, 0);
    assert.equal(redacted.paid_sar, 0);
  });
});

describe("invoiceableOrderForSession", () => {
  it("hides estimated cost unless admin", () => {
    assert.equal(invoiceableOrderForSession({ isAdmin: true }, invoiceable).estimated_cost_sar, 900);
    assert.equal(invoiceableOrderForSession({ isAdmin: false }, invoiceable).estimated_cost_sar, null);
  });
});
