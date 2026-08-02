import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  summarizePurchaseOrderSupplierEmail,
  summarizeSalesOrderSupplierEmail,
  supplierEmailStatusShortLabel,
} from "@/lib/sales-orders/supplier-email-status";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { SalesOrder } from "@/lib/types/sales-orders";

function po(overrides: Partial<PurchaseOrder> & Pick<PurchaseOrder, "id">): PurchaseOrder {
  return {
    po_number: "PO-2026-0001",
    supplier_id: "caccioppoli",
    status: "draft",
    order_date: "2026-07-02",
    expected_date: null,
    total_amount: 100,
    client_reference: "FR-0626-0037-SO-2026-0116",
    emailed_at: null,
    email_to: null,
    expected_carrier: "DHL",
    sales_order_id: "so-1",
    lines: [
      {
        id: "l1",
        fabric_number: "360102",
        quantity_ordered: 1.2,
        unit_price: 0,
        client_reference: null,
        emailed_at: null,
      },
    ],
    ...overrides,
  };
}

const order = {
  id: "so-1",
  so_number: "SO-2026-0116",
  fabric_po_ids: ["po-1"],
  fabric_lines: [
    {
      id: "fl1",
      fabric_number: "360102",
      supplier_id: "caccioppoli",
      supplier_name: "Caccioppoli",
      garment_type: "Shirt LS",
      quantity: 1.2,
      label_stickers: [{ code: "FR-0626-0037/ 0116-L01", piece_name: "Shirt", sequence: 1 }],
    },
  ],
} as Pick<SalesOrder, "id" | "so_number" | "fabric_po_ids" | "fabric_lines">;

describe("summarizeSalesOrderSupplierEmail", () => {
  it("returns none when there are no fabric lines", () => {
    const empty = { ...order, fabric_lines: [], fabric_po_ids: [] };
    const summary = summarizeSalesOrderSupplierEmail(empty, []);
    assert.equal(summary.status, "none");
    assert.equal(supplierEmailStatusShortLabel(summary), "—");
  });

  it("returns pending when fabric lines exist but linked POs are missing", () => {
    const summary = summarizeSalesOrderSupplierEmail(order, []);
    assert.equal(summary.status, "pending");
    assert.equal(summary.pending, 1);
    assert.equal(supplierEmailStatusShortLabel(summary), "Email pending");
  });

  it("returns pending when PO lines are unsent", () => {
    const summary = summarizeSalesOrderSupplierEmail(order, [po({ id: "po-1" })]);
    assert.equal(summary.status, "pending");
    assert.equal(summary.pending, 1);
    assert.equal(supplierEmailStatusShortLabel(summary), "Email pending");
  });

  it("returns sent when PO lines are emailed", () => {
    const summary = summarizeSalesOrderSupplierEmail(order, [
      po({
        id: "po-1",
        emailed_at: "2026-07-02T10:00:00Z",
        lines: [
          {
            id: "l1",
            fabric_number: "360102",
            quantity_ordered: 1.2,
            unit_price: 0,
            client_reference: null,
            emailed_at: "2026-07-02T10:00:00Z",
            label_stickers: [{ code: "FR-0626-0037/ 0116-L01", piece_name: "Shirt", sequence: 1 }],
          },
        ],
      }),
    ]);
    assert.equal(summary.status, "sent");
    assert.equal(supplierEmailStatusShortLabel(summary), "Email sent");
  });
});

describe("summarizePurchaseOrderSupplierEmail", () => {
  it("marks partial when some lines sent", () => {
    const summary = summarizePurchaseOrderSupplierEmail(
      po({
        id: "po-1",
        emailed_at: "2026-07-02T10:00:00Z",
        lines: [
          {
            id: "l1",
            fabric_number: "360102",
            quantity_ordered: 1,
            unit_price: 0,
            client_reference: null,
            emailed_at: "2026-07-02T10:00:00Z",
          },
          {
            id: "l2",
            fabric_number: "360101",
            quantity_ordered: 1,
            unit_price: 0,
            client_reference: null,
            emailed_at: null,
          },
        ],
      })
    );
    assert.equal(summary.status, "partial");
    assert.equal(summary.sent, 1);
    assert.equal(summary.pending, 1);
  });
});
