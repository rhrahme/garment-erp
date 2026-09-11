import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rebuildInvoiceLinesFromSalesOrders,
  syncInvoiceLinesFromSalesOrders,
} from "./build-invoice.ts";
import type { CustomerInvoice, CustomerInvoiceLine } from "@/lib/types/customer-invoices";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function fabricLine(
  overrides: Partial<SalesOrderFabricLine> & Pick<SalesOrderFabricLine, "id">
): SalesOrderFabricLine {
  return {
    garment_type: "Trouser",
    label_count: 1,
    label_stickers: [],
    supplier_id: "loro-piana",
    supplier_name: "Loro Piana",
    fabric_number: "771001",
    quantity: 1.4,
    unit: "meters",
    unit_price: 100,
    composition: "100% Cotton",
    weight_gsm: 240,
    width_cm: null,
    width_inches: null,
    color: null,
    ...overrides,
  };
}

function order(
  overrides: Partial<SalesOrder> & Pick<SalesOrder, "id" | "so_number">
): SalesOrder {
  return {
    client_id: "client-khaled",
    client_code: "FR-0626-0037",
    client_name: "Pr Khaled Bin Salman",
    client_reference: null,
    order_date: "2026-06-01",
    delivery_date: null,
    delivery_destination: "RUH",
    status: "confirmed",
    notes: null,
    fabric_lines: [fabricLine({ id: `${overrides.id}-f1` })],
    fabric_po_ids: [],
    ...overrides,
  };
}

function invoiceWith(lines: CustomerInvoiceLine[], orders: SalesOrder[]): CustomerInvoice {
  return {
    id: "inv-1",
    invoice_number: "INV-2026-0018",
    sales_order_id: orders[0]!.id,
    so_number: orders.map((o) => o.so_number).join(", "),
    sales_orders: orders.map((o) => ({ id: o.id, so_number: o.so_number })),
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
    lines,
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
  } as CustomerInvoice;
}

/** A line left behind by an earlier, wrong build: stale price, stale quantity. */
function staleLine(articleNumber: number): CustomerInvoiceLine {
  return {
    id: `stale-${articleNumber}`,
    article_number: articleNumber,
    sales_order_line_id: null,
    description: "Stale flattened row",
    garment_type: "Short",
    piece_name: "Short",
    sticker_code: null,
    fabric_number: "999999",
    fabric_brand: "Solbiati",
    composition: "100% Cotton",
    weight_gsm: 240,
    quantity: 12,
    unit_price: 535.87,
    line_total: 6430.44,
    cost_hint_sar: 1064.04,
    fabric_cost_hint_sar: 824.04,
  };
}

describe("rebuildInvoiceLinesFromSalesOrders", () => {
  it("drops stale stored lines instead of preserving their prices", () => {
    const orders = [order({ id: "so-a", so_number: "SO-2026-0111" })];
    const before = invoiceWith([staleLine(1)], orders);

    const after = rebuildInvoiceLinesFromSalesOrders(before, orders);

    assert.equal(
      after.lines.some((line) => line.unit_price === 535.87),
      false,
      "the stale 535.87 price must not survive a rebuild"
    );
    assert.equal(
      after.lines.some((line) => line.fabric_number === "999999"),
      false,
      "the stale fabric number must not survive a rebuild"
    );
    assert.equal(
      after.lines.every((line) => line.sales_order_line_id != null),
      true,
      "every rebuilt line traces back to a sales-order fabric line"
    );
  });

  it("keeps one line per fabric line across several orders", () => {
    const orders = [
      order({ id: "so-a", so_number: "SO-2026-0111" }),
      order({
        id: "so-b",
        so_number: "SO-2026-0113",
        fabric_lines: [
          fabricLine({
            id: "so-b-f1",
            supplier_id: "zegna",
            supplier_name: "Zegna",
            fabric_number: "880002",
            unit_price: 140,
          }),
        ],
      }),
    ];
    const before = invoiceWith([staleLine(1)], orders);

    const after = rebuildInvoiceLinesFromSalesOrders(before, orders);
    const linkedIds = after.lines.map((line) => line.sales_order_line_id);

    assert.equal(after.lines.length, 2);
    assert.ok(linkedIds.includes("so-a-f1"));
    assert.ok(linkedIds.includes("so-b-f1"), "the second order's line must not be lost");
    assert.deepEqual(
      after.lines.map((line) => line.article_number),
      [1, 2],
      "articles are renumbered across the whole invoice"
    );
  });

  it("keeps different mills apart", () => {
    const orders = [
      order({
        id: "so-a",
        so_number: "SO-2026-0111",
        fabric_lines: [
          fabricLine({ id: "a1", supplier_id: "zegna", supplier_name: "Zegna" }),
          fabricLine({ id: "a2", supplier_id: "loro-piana", supplier_name: "Loro Piana" }),
        ],
      }),
    ];
    const after = rebuildInvoiceLinesFromSalesOrders(invoiceWith([], orders), orders);

    assert.equal(after.lines.length, 2, "a Zegna trouser never merges into a Loro Piana trouser");
  });

  it("differs from sync, which preserves the stale price", () => {
    const orders = [order({ id: "so-a", so_number: "SO-2026-0111" })];
    const before = invoiceWith([staleLine(1)], orders);

    const synced = syncInvoiceLinesFromSalesOrders(before, orders);

    assert.equal(
      synced.lines.some((line) => line.unit_price === 535.87),
      true,
      "sync is an append-and-keep operation - this is why it could not repair the invoice"
    );
  });
});
