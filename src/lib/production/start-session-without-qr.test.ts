import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listPiecesForManualStart,
  listStitchEmployeesForManualStart,
  validateManualStartAt,
} from "./start-session-without-qr.ts";
import { riyadhWallTimeToUtcMs } from "./stitch-kiosk-lunch.ts";
import type { PayrollEmployee } from "../types/hr-payroll.ts";
import type { SalesOrder, SalesOrderFabricLine } from "../types/sales-orders.ts";

describe("validateManualStartAt", () => {
  const now = riyadhWallTimeToUtcMs(2026, 9, 6, 16, 0);

  it("accepts a Riyadh datetime during today's workday", () => {
    const result = validateManualStartAt("2026-09-06T10:15", now);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.atMs, riyadhWallTimeToUtcMs(2026, 9, 6, 10, 15));
    }
  });

  it("rejects a future start time", () => {
    const result = validateManualStartAt("2026-09-06T18:00", now);
    assert.equal(result.ok, false);
  });

  it("rejects a start before 08:00 of the current workday", () => {
    const result = validateManualStartAt("2026-09-05T16:00", now);
    assert.equal(result.ok, false);
  });
});

describe("listPiecesForManualStart", () => {
  const line: SalesOrderFabricLine = {
    id: "line-1",
    supplier_id: "drapers",
    supplier_name: "Drapers",
    fabric_number: "771020",
    garment_type: "Trouser",
    quantity: 2,
    unit: "meters",
    unit_price: 10,
    label_count: 1,
    label_stickers: [{ code: "FR-0626-0001-L04-TR", piece_name: "Trouser", sequence: 1 }],
    composition: null,
    weight_gsm: null,
    width_cm: null,
    width_inches: null,
    color: null,
  };

  const order = {
    id: "so-1",
    so_number: "SO-2026-0999",
    client_id: "c1",
    client_code: "FR-0626-0001",
    client_name: "Test Client",
    client_reference: "FR-0626-0001",
    status: "open",
    order_date: "2026-09-01",
    delivery_date: null,
    delivery_destination: "RUH",
    notes: null,
    product_article: null,
    retail_brand: null,
    fabric_order_requested_at: null,
    fabric_order_requested_by: null,
    fabric_po_ids: [],
    fabric_lines: [line],
  } as SalesOrder;

  it("finds a piece by client name", () => {
    const rows = listPiecesForManualStart("Test Client", [order]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.client_name, "Test Client");
    assert.ok(rows[0]!.production_code.includes("L04"));
  });
});

describe("listStitchEmployeesForManualStart", () => {
  it("lists only active Expats ID-badge holders", () => {
    const rows = listStitchEmployeesForManualStart([
      {
        id: "e1",
        employee_id_number: "100",
        full_name: "Ahmad Legal",
        short_name: "Ahmad",
        bank_name: "Banque Saudi Fransi",
        is_active: true,
      } as PayrollEmployee,
      {
        id: "e2",
        employee_id_number: "200",
        full_name: "Saudi Tailor",
        bank_name: "AL RAJHI BANK",
        is_active: true,
      } as PayrollEmployee,
      {
        id: "e3",
        employee_id_number: "300",
        full_name: "Inactive Expat",
        bank_name: "ANB",
        is_active: false,
      } as PayrollEmployee,
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, "e1");
    assert.equal(rows[0]!.full_name, "Ahmad");
  });
});
