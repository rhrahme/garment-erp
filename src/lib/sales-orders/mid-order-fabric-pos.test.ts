import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAppendFabricLines,
  canEditFabricLines,
  canMutateSalesOrderFabricLine,
} from "./fabric-lines-rules.ts";
import { listSalesOrderFabricLinesMissingPos } from "./line-cross-reference.ts";
import { getFabricPosBlockReason } from "./todays-fabric.ts";
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
    so_number: "SO-2026-0122",
    client_id: "client-ajlan",
    client_code: "AJL",
    client_name: "Ajlan",
    client_reference: "AJL-SO-2026-0122",
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
    status: overrides.status ?? "ordered",
    order_date: "2026-06-01",
    expected_date: null,
    total_amount: 0,
    client_reference: "AJL-SO-2026-0122",
    emailed_at: overrides.emailed_at ?? null,
    email_to: null,
    expected_carrier: null,
    sales_order_id: "so-122",
    lines: overrides.lines,
  };
}

describe("mid-order fabric append + ordering gates", () => {
  it("allows append after supplier POs exist, but not full edit", () => {
    const withPos = {
      status: "fabric_pos_created" as const,
      fabric_po_ids: ["po-1"],
      retail_brand: null,
    };
    assert.equal(canAppendFabricLines(withPos), true);
    assert.equal(canEditFabricLines(withPos), false);
  });

  it("allows mutate only for unordered lines after POs exist", () => {
    const orderedLine = line({ id: "line-1", fabric_number: "111" });
    const newLine = line({ id: "line-2", fabric_number: "722042" });
    const fabricPos = [
      po({
        id: "po-1",
        lines: [
          {
            id: "pol-1",
            fabric_number: "111",
            quantity_ordered: 2,
            unit_price: 10,
            client_reference: null,
            label_stickers: orderedLine.label_stickers,
            garment_type: "Jacket",
          },
        ],
      }),
    ];
    const gate = {
      status: "fabric_pos_created" as const,
      fabric_po_ids: ["po-1"],
      retail_brand: null,
    };
    assert.equal(canMutateSalesOrderFabricLine(gate, orderedLine, fabricPos), false);
    assert.equal(canMutateSalesOrderFabricLine(gate, newLine, fabricPos), true);
  });

  it("lists missing PO coverage for newly added L06-style lines", () => {
    const orderedLine = line({ id: "line-1", fabric_number: "111" });
    const newLine = line({ id: "line-6", fabric_number: "722042" });
    const fabricPos = [
      po({
        id: "po-1",
        lines: [
          {
            id: "pol-1",
            fabric_number: "111",
            quantity_ordered: 2,
            unit_price: 10,
            client_reference: null,
            label_stickers: orderedLine.label_stickers,
            garment_type: "Jacket",
          },
        ],
      }),
    ];
    const missing = listSalesOrderFabricLinesMissingPos([orderedLine, newLine], fabricPos);
    assert.deepEqual(
      missing.map((item) => item.id),
      ["line-6"]
    );
  });

  it("unblocks PO creation when unmatched lines remain on fabric_pos_created orders", () => {
    const orderedLine = line({ id: "line-1", fabric_number: "111" });
    const newLine = line({ id: "line-6", fabric_number: "722042" });
    const salesOrder = order({
      id: "so-122",
      status: "fabric_pos_created",
      fabric_po_ids: ["po-1"],
      fabric_lines: [orderedLine, newLine],
    });
    const fabricPos = [
      po({
        id: "po-1",
        lines: [
          {
            id: "pol-1",
            fabric_number: "111",
            quantity_ordered: 2,
            unit_price: 10,
            client_reference: null,
            label_stickers: orderedLine.label_stickers,
            garment_type: "Jacket",
          },
        ],
      }),
    ];
    assert.equal(getFabricPosBlockReason(salesOrder, fabricPos), null);
    assert.equal(
      getFabricPosBlockReason(
        order({
          id: "so-122",
          status: "fabric_pos_created",
          fabric_po_ids: ["po-1"],
          fabric_lines: [orderedLine],
        }),
        fabricPos
      ),
      "POs already exist"
    );
  });
});
