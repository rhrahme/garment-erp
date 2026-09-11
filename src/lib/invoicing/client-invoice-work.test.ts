import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientInvoiceWorkButtonLabel,
  describeClientInvoiceWork,
  groupClientInvoiceWork,
} from "./client-invoice-work.ts";
import type { CustomerInvoice } from "@/lib/types/customer-invoices";
import type { InvoiceableSalesOrder } from "@/lib/types/invoiceable-orders";

function invoice(overrides: Partial<CustomerInvoice> & Pick<CustomerInvoice, "id">): CustomerInvoice {
  return {
    invoice_number: `INV-${overrides.id}`,
    sales_order_id: "so-1",
    so_number: "SO-2026-0111",
    client_id: "client-khaled",
    client_code: "FR-0626-0037",
    client_name: "Pr Khaled Bin Salman",
    status: "draft",
    payments: [],
    total: 0,
    ...overrides,
  } as CustomerInvoice;
}

function order(overrides: Partial<InvoiceableSalesOrder> & Pick<InvoiceableSalesOrder, "id">): InvoiceableSalesOrder {
  return {
    so_number: "SO-2026-0116",
    client_name: "Pr Khaled Bin Salman",
    client_code: "FR-0626-0037",
    order_date: "2026-07-02",
    status: "fabric_pos_created",
    piece_count: 110,
    fabric_line_count: 71,
    estimated_cost_sar: null,
    ...overrides,
  } as InvoiceableSalesOrder;
}

describe("groupClientInvoiceWork", () => {
  it("offers one draft plus the client's uninvoiced orders", () => {
    const groups = groupClientInvoiceWork(
      [invoice({ id: "a" })],
      [order({ id: "so-116" }), order({ id: "so-121", so_number: "SO-2026-0121" })]
    );
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.drafts.length, 1);
    assert.equal(groups[0]!.orders.length, 2);
    assert.equal(
      describeClientInvoiceWork(groups[0]!),
      "1 draft invoice and 2 uninvoiced orders"
    );
    assert.equal(clientInvoiceWorkButtonLabel(groups[0]!), "Add 2 orders to this invoice");
  });

  it("still combines several drafts and labels added orders", () => {
    const drafts = [invoice({ id: "a" }), invoice({ id: "b" })];
    assert.equal(
      clientInvoiceWorkButtonLabel(groupClientInvoiceWork(drafts, [])[0]!),
      "Combine 2 invoices into 1"
    );
    assert.equal(
      clientInvoiceWorkButtonLabel(groupClientInvoiceWork(drafts, [order({ id: "so-116" })])[0]!),
      "Combine 2 invoices + 1 order into 1"
    );
  });

  it("skips clients with no draft, other clients, and sent invoices", () => {
    assert.deepEqual(groupClientInvoiceWork([], [order({ id: "so-116" })]), []);
    assert.deepEqual(
      groupClientInvoiceWork([invoice({ id: "a", status: "sent" })], [order({ id: "so-116" })]),
      []
    );
    assert.deepEqual(
      groupClientInvoiceWork(
        [invoice({ id: "a" })],
        [order({ id: "so-9", client_code: "FR-0426-0007", client_name: "Khaled Al Moussa" })]
      ),
      []
    );
  });
});
