import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listSalesOrderFabricLinesMissingPos } from "./line-cross-reference.ts";
import type { PurchaseOrder } from "../types/fabric-sourcing.ts";
import type { SalesOrderFabricLine } from "../types/sales-orders.ts";

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
    ...rest,
  };
}

describe("transfer inbound lines skip supplier POs", () => {
  it("excludes on-hand transfer lines from missing PO list", () => {
    const inbound = line({
      id: "line-in",
      fabric_number: "722042",
      transfer_inbound: {
        transfer_id: "ft-1",
        source_so_number: "SO-2026-0001",
        source_client_name: "Client A",
        source_line_id: "line-a",
        original_sticker_codes: ["AJL-SO-2026-0001-L01-JKT"],
        meters: 2,
      },
    });
    const normal = line({ id: "line-2", fabric_number: "111" });
    const missing = listSalesOrderFabricLinesMissingPos([inbound, normal], []);
    assert.deepEqual(
      missing.map((item) => item.id),
      ["line-2"]
    );
  });

  it("still flags replacement reorder lines as missing PO until ordered", () => {
    const replacement = line({
      id: "line-repl",
      fabric_number: "722042",
      transfer_replacement: {
        transfer_id: "ft-1",
        destination_so_number: "SO-2026-0002",
        destination_client_name: "Client B",
        meters: 2,
      },
    });
    const missing = listSalesOrderFabricLinesMissingPos([replacement], []);
    assert.equal(missing.length, 1);
    assert.equal(missing[0]?.id, "line-repl");
  });

  it("does not treat replacement as covered by an older same-fabric PO", () => {
    const replacement = line({
      id: "line-repl",
      fabric_number: "722042",
      label_stickers: [{ code: "AJL-SO-2026-0001-L02-JKT", piece_name: "Jacket", sequence: 1 }],
      transfer_replacement: {
        transfer_id: "ft-1",
        destination_so_number: "SO-2026-0002",
        destination_client_name: "Client B",
        meters: 2,
      },
    });
    const oldPo: PurchaseOrder[] = [
      {
        id: "po-old",
        po_number: "PO-OLD",
        supplier_id: "drapers",
        status: "ordered",
        order_date: "2026-06-01",
        expected_date: null,
        total_amount: 0,
        client_reference: "AJL-SO-2026-0001",
        emailed_at: "2026-06-02T00:00:00.000Z",
        email_to: null,
        expected_carrier: null,
        sales_order_id: "so-1",
        lines: [
          {
            id: "pol-old",
            fabric_number: "722042",
            quantity_ordered: 2,
            unit_price: 10,
            label_count: 1,
            label_stickers: [{ code: "AJL-SO-2026-0001-L01-JKT", piece_name: "Jacket", sequence: 1 }],
            garment_type: "Jacket",
            client_reference: "AJL-SO-2026-0001",
          },
        ],
      },
    ];
    const missing = listSalesOrderFabricLinesMissingPos([replacement], oldPo);
    assert.equal(missing.length, 1);
    assert.equal(missing[0]?.id, "line-repl");
  });

  it("treats replacement as covered once a PO matches its new stickers", () => {
    const replacement = line({
      id: "line-repl",
      fabric_number: "722042",
      label_stickers: [{ code: "AJL-SO-2026-0001-L02-JKT", piece_name: "Jacket", sequence: 1 }],
      transfer_replacement: {
        transfer_id: "ft-1",
        destination_so_number: "SO-2026-0002",
        destination_client_name: "Client B",
        meters: 2,
      },
    });
    const pos: PurchaseOrder[] = [
      {
        id: "po-1",
        po_number: "PO-1",
        supplier_id: "drapers",
        status: "ordered",
        order_date: "2026-06-01",
        expected_date: null,
        total_amount: 0,
        client_reference: "AJL-SO-2026-0001",
        emailed_at: null,
        email_to: null,
        expected_carrier: null,
        sales_order_id: "so-1",
        lines: [
          {
            id: "pol-1",
            fabric_number: "722042",
            quantity_ordered: 2,
            unit_price: 10,
            label_count: 1,
            label_stickers: [{ code: "AJL-SO-2026-0001-L02-JKT", piece_name: "Jacket", sequence: 1 }],
            garment_type: "Jacket",
            client_reference: "AJL-SO-2026-0001",
          },
        ],
      },
    ];
    const missing = listSalesOrderFabricLinesMissingPos([replacement], pos);
    assert.equal(missing.length, 0);
  });
});
