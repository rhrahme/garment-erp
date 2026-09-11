import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCombineCustomerInvoices,
  canTakeOnSalesOrders,
  groupCombinableDraftInvoices,
} from "./combine-invoice-groups.ts";
import { combineCustomerInvoices } from "./combine-invoices.ts";
import { invoiceSalesOrderIds } from "./invoice-sales-orders.ts";
import type { CustomerInvoice, CustomerInvoiceLine } from "@/lib/types/customer-invoices";

function line(overrides: Partial<CustomerInvoiceLine> & Pick<CustomerInvoiceLine, "id">): CustomerInvoiceLine {
  return {
    article_number: 1,
    sales_order_line_id: null,
    description: "Shirt LS",
    garment_type: "Shirt LS",
    piece_name: "Shirt LS",
    sticker_code: null,
    fabric_number: "771001",
    fabric_brand: "Loro Piana",
    composition: "100% linen",
    weight_gsm: 180,
    quantity: 1,
    unit_price: 0,
    line_total: 0,
    cost_hint_sar: null,
    fabric_cost_hint_sar: null,
    ...overrides,
  };
}

function invoice(
  overrides: Partial<CustomerInvoice> & Pick<CustomerInvoice, "id" | "invoice_number" | "sales_order_id" | "so_number">
): CustomerInvoice {
  return {
    client_id: "client-khaled",
    client_code: "FR-0626-0037",
    client_name: "Pr Khaled Bin Salman",
    client_reference: null,
    client_email: null,
    client_address: null,
    payment_terms: null,
    currency: "SAR",
    status: "draft",
    invoice_date: "2026-09-11",
    due_date: null,
    lines: [line({ id: `${overrides.id}-l1` })],
    subtotal: 0,
    vat_rate: 0.15,
    vat_amount: 0,
    total: 0,
    notes: null,
    created_at: "2026-09-11T12:00:00.000Z",
    sent_at: null,
    paid_at: null,
    payments: [],
    factory_brand_name: "Ibi",
    total_cost_sar: null,
    delivery_destination: "RUH",
    ...overrides,
  };
}

describe("combineCustomerInvoices", () => {
  it("combines three same-client drafts into one invoice", () => {
    const invoices = [
      invoice({
        id: "inv-a",
        invoice_number: "INV-2026-0020",
        sales_order_id: "so-111",
        so_number: "SO-2026-0111",
        invoice_date: "2026-09-11",
        created_at: "2026-09-11T12:00:00.000Z",
      }),
      invoice({
        id: "inv-b",
        invoice_number: "INV-2026-0021",
        sales_order_id: "so-113",
        so_number: "SO-2026-0113",
        invoice_date: "2026-07-15",
        created_at: "2026-07-15T09:00:00.000Z",
        lines: [line({ id: "inv-b-l1", fabric_number: "771002" })],
      }),
      invoice({
        id: "inv-c",
        invoice_number: "INV-2026-0022",
        sales_order_id: "so-116",
        so_number: "SO-2026-0116",
        invoice_date: "2026-08-01",
        created_at: "2026-08-01T10:00:00.000Z",
        lines: [
          line({
            id: "inv-c-l1",
            garment_type: "Trouser",
            piece_name: "Trousers",
            description: "Trouser",
            composition: "100% cotton",
            weight_gsm: 240,
          }),
        ],
      }),
    ];

    assert.equal(canCombineCustomerInvoices(invoices), null);
    const combined = combineCustomerInvoices(invoices);
    assert.equal(combined.id, "inv-a");
    assert.equal(combined.invoice_number, "INV-2026-0020");
    assert.equal(combined.invoice_date, "2026-07-15");
    assert.equal(combined.created_at, "2026-07-15T09:00:00.000Z");
    assert.equal(combined.so_number, "SO-2026-0111, SO-2026-0113, SO-2026-0116");
    assert.deepEqual(invoiceSalesOrderIds(combined).sort(), ["so-111", "so-113", "so-116"]);
    assert.equal(combined.lines.length, 2);
    const shirts = combined.lines.find((row) => row.garment_type === "Shirt LS");
    assert.ok(shirts);
    assert.equal(shirts.quantity, 2);
    assert.match(combined.notes ?? "", /INV-2026-0020, INV-2026-0021, INV-2026-0022/);
  });

  it("uses the oldest sales-order date when every draft is dated today", () => {
    const invoices = [
      invoice({
        id: "inv-a",
        invoice_number: "INV-2026-0020",
        sales_order_id: "so-111",
        so_number: "SO-2026-0111",
        payment_terms: "Net 30",
      }),
      invoice({
        id: "inv-b",
        invoice_number: "INV-2026-0021",
        sales_order_id: "so-113",
        so_number: "SO-2026-0113",
        payment_terms: "Net 30",
        lines: [line({ id: "inv-b-l1", fabric_number: "771002" })],
      }),
      invoice({
        id: "inv-c",
        invoice_number: "INV-2026-0022",
        sales_order_id: "so-116",
        so_number: "SO-2026-0116",
        payment_terms: "Net 30",
        lines: [line({ id: "inv-c-l1", fabric_number: "771003" })],
      }),
    ];

    const combined = combineCustomerInvoices(invoices, {
      orderDates: ["2026-09-01", "2026-07-15", "2026-08-01"],
    });
    assert.equal(combined.invoice_date, "2026-07-15");
    assert.equal(combined.due_date, "2026-08-14");
    assert.equal(combined.created_at, "2026-09-11T12:00:00.000Z");
  });

  it("does not note a combine when one draft only takes on sales orders", () => {
    const only = invoice({
      id: "inv-a",
      invoice_number: "INV-2026-0018",
      sales_order_id: "so-131",
      so_number: "SO-2026-0131",
      notes: "Deliver to Riyadh.",
    });
    const combined = combineCustomerInvoices([only], { orderDates: ["2026-06-30"] });
    assert.equal(combined.notes, "Deliver to Riyadh.");
    assert.equal(combined.invoice_date, "2026-06-30");
  });

  it("refuses paid invoices and different clients", () => {
    const paid = invoice({
      id: "paid",
      invoice_number: "INV-2026-0001",
      sales_order_id: "so-1",
      so_number: "SO-2026-0001",
      status: "paid",
    });
    const other = invoice({
      id: "other",
      invoice_number: "INV-2026-0002",
      sales_order_id: "so-2",
      so_number: "SO-2026-0002",
      client_id: "someone-else",
      client_code: "FR-0000-0001",
    });
    const draft = invoice({
      id: "draft",
      invoice_number: "INV-2026-0003",
      sales_order_id: "so-3",
      so_number: "SO-2026-0003",
    });
    assert.match(canCombineCustomerInvoices([paid, draft]) ?? "", /Paid/);
    assert.match(canCombineCustomerInvoices([draft, other]) ?? "", /same client/);
    assert.equal(canTakeOnSalesOrders(draft), null);
    assert.match(canTakeOnSalesOrders(paid) ?? "", /Paid/);
  });

  it("groups combinable drafts by client", () => {
    const groups = groupCombinableDraftInvoices([
      invoice({ id: "a", invoice_number: "INV-2026-0001", sales_order_id: "so-1", so_number: "SO-2026-0001" }),
      invoice({ id: "b", invoice_number: "INV-2026-0002", sales_order_id: "so-2", so_number: "SO-2026-0002" }),
      invoice({
        id: "c",
        invoice_number: "INV-2026-0003",
        sales_order_id: "so-3",
        so_number: "SO-2026-0003",
        client_id: "other",
        client_code: "FR-0000-0001",
      }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.length, 2);
  });
});
