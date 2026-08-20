import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guardLineRemovalPatternSync } from "@/lib/pattern/sync-guard";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function order(): SalesOrder {
  const line = {
    id: "line-a",
    garment_type: "Jacket",
    label_count: 1,
    label_stickers: [{ code: "X", piece_name: "Blazers", sequence: 1 }],
    supplier_id: "sup-1",
    supplier_name: "Supplier",
    fabric_number: "123",
    quantity: 2.5,
    unit: "m",
    unit_price: 100,
    composition: "100% Wool",
    weight_gsm: 280,
    width_cm: 150,
    width_inches: null,
    color: null,
  } as SalesOrderFabricLine;
  return {
    id: "so-1",
    so_number: "SO-2026-0001",
    client_id: "client-1",
    client_code: "GL-0001",
    client_name: "Test Client",
    client_reference: null,
    order_date: "2026-01-01",
    delivery_date: null,
    delivery_destination: null,
    status: "open",
    notes: null,
    fabric_lines: [line],
    fabric_po_ids: [],
  };
}

describe("pattern sync guard - ERP is source of truth", () => {
  it("does not block line removal for leftover pattern jobs", () => {
    const result = guardLineRemovalPatternSync(order(), "line-a", false);
    assert.equal(result.ok, true);
  });
});
