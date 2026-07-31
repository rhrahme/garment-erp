import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isFabricLineDeletePending,
  listPendingFabricLineDeleteRequests,
} from "./fabric-line-delete-request-list.ts";
import { canMutateSalesOrderFabricLine } from "./fabric-lines-rules.ts";
import type { PurchaseOrder } from "../types/fabric-sourcing.ts";
import type { SalesOrder, SalesOrderFabricLine } from "../types/sales-orders.ts";

function line(
  overrides: Partial<SalesOrderFabricLine> & Pick<SalesOrderFabricLine, "id" | "fabric_number">
): SalesOrderFabricLine {
  const { id, fabric_number, ...rest } = overrides;
  return {
    id,
    supplier_id: "drapers",
    supplier_name: "Drapers",
    fabric_number,
    garment_type: "Jacket",
    quantity: 2,
    unit: "meters",
    unit_price: 10,
    label_count: 1,
    label_stickers: [{ code: `${id}-S1`, piece_name: "Jacket", sequence: 1 }],
    composition: null,
    weight_gsm: null,
    width_cm: null,
    width_inches: null,
    color: null,
    a4_printed_at: null,
    prep_stickers_printed_at: null,
    prod_stickers_printed_at: null,
    added_at: null,
    added_by: null,
    needs_replacement: false,
    ...rest,
  };
}

function order(
  overrides: Partial<SalesOrder> & Pick<SalesOrder, "id" | "status" | "fabric_lines" | "fabric_po_ids">
): SalesOrder {
  return {
    so_number: "SO-2026-0130",
    client_id: "client-ajlan",
    client_code: "AJL",
    client_name: "Ajlan",
    client_reference: "AJL-SO-2026-0130",
    order_date: "2026-06-01",
    delivery_date: null,
    delivery_destination: "RUH",
    notes: null,
    product_article: null,
    retail_brand: null,
    fabric_order_requested_at: null,
    fabric_order_requested_by: null,
    ...overrides,
  };
}

function po(overrides: Partial<PurchaseOrder> & Pick<PurchaseOrder, "id" | "lines">): PurchaseOrder {
  return {
    id: overrides.id,
    po_number: overrides.po_number ?? `PO-${overrides.id}`,
    supplier_id: overrides.supplier_id ?? "drapers",
    status: overrides.status ?? "sent",
    order_date: "2026-06-01",
    expected_date: null,
    total_amount: 0,
    client_reference: "AJL-SO-2026-0130",
    emailed_at: overrides.emailed_at ?? "2026-06-02T10:00:00.000Z",
    email_to: "supplier@example.com",
    expected_carrier: null,
    sales_order_id: "so-130",
    lines: overrides.lines,
  };
}

describe("fabric line delete request list", () => {
  it("treats delete_requested_at as pending", () => {
    assert.equal(isFabricLineDeletePending(line({ id: "l1", fabric_number: "A" })), false);
    assert.equal(
      isFabricLineDeletePending(
        line({
          id: "l1",
          fabric_number: "A",
          delete_requested_at: "2026-07-31T10:00:00.000Z",
        })
      ),
      true
    );
  });

  it("lists pending requests with PO email status for admin queue", () => {
    const locked = line({
      id: "line-wrong",
      fabric_number: "WRONG1",
      delete_requested_at: "2026-07-31T12:00:00.000Z",
      delete_requested_by: "hagan.qc@gmail.com",
      delete_request_reason: "Wrong article",
      label_stickers: [{ code: "FR-AJL-L01-JKT", piece_name: "Jacket", sequence: 1 }],
    });
    const so = order({
      id: "so-130",
      status: "fabric_pos_created",
      fabric_po_ids: ["po-1"],
      fabric_lines: [locked],
    });
    const fabricPos = [
      po({
        id: "po-1",
        po_number: "PO-2026-0099",
        lines: [
          {
            id: "po-1-line-1",
            fabric_number: "WRONG1",
            quantity_ordered: 2,
            unit_price: 10,
            garment_type: "Jacket",
            client_reference: "AJL-SO-2026-0130",
            label_stickers: [{ code: "FR-AJL-L01-JKT", piece_name: "Jacket", sequence: 1 }],
            emailed_at: "2026-06-02T10:00:00.000Z",
          },
        ],
      }),
    ];

    assert.equal(canMutateSalesOrderFabricLine(so, locked, fabricPos), false);
    const pending = listPendingFabricLineDeleteRequests([so], fabricPos);
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.so_number, "SO-2026-0130");
    assert.equal(pending[0]!.delete_requested_by, "hagan.qc@gmail.com");
    assert.equal(pending[0]!.po_number, "PO-2026-0099");
    assert.equal(pending[0]!.po_line_emailed, true);
  });

  it("ignores cancelled PO lines when matching", () => {
    const fabricLine = line({
      id: "line-1",
      fabric_number: "X1",
      delete_requested_at: "2026-07-31T12:00:00.000Z",
      delete_requested_by: "qc@example.com",
      label_stickers: [{ code: "FR-AJL-L01-JKT", piece_name: "Jacket", sequence: 1 }],
    });
    const so = order({
      id: "so-130",
      status: "fabric_pos_created",
      fabric_po_ids: ["po-1"],
      fabric_lines: [fabricLine],
    });
    const fabricPos = [
      po({
        id: "po-1",
        lines: [
          {
            id: "po-1-line-1",
            fabric_number: "X1",
            quantity_ordered: 2,
            unit_price: 10,
            garment_type: "Jacket",
            client_reference: null,
            label_stickers: [{ code: "FR-AJL-L01-JKT", piece_name: "Jacket", sequence: 1 }],
            emailed_at: "2026-06-02T10:00:00.000Z",
            cancelled_at: "2026-07-31T13:00:00.000Z",
            cancelled_reason: "admin approved delete",
          },
        ],
      }),
    ];

    assert.equal(canMutateSalesOrderFabricLine(so, fabricLine, fabricPos), true);
    const pending = listPendingFabricLineDeleteRequests([so], fabricPos);
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.po_id, null);
    assert.equal(pending[0]!.po_line_emailed, false);
  });
});
