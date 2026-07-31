import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fabricLineMeaningfullyChanged,
  lineHasPrintEvidence,
  orderHasFabricPosLock,
  shouldRecordFabricChangeAlert,
  snapshotFabricLine,
} from "./fabric-change-alert-gates.ts";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

function line(partial: Partial<SalesOrderFabricLine> = {}): SalesOrderFabricLine {
  return {
    id: "line-1",
    garment_type: "Shirt",
    label_count: 1,
    label_stickers: [],
    supplier_id: "sup-1",
    supplier_name: "Supplier",
    fabric_number: "ABC123",
    quantity: 2.5,
    unit: "m",
    unit_price: 10,
    composition: null,
    weight_gsm: null,
    width_cm: null,
    width_inches: null,
    color: null,
    ...partial,
  } as SalesOrderFabricLine;
}

function order(
  partial: Partial<SalesOrder> = {},
  lines: SalesOrderFabricLine[] = [line()]
): SalesOrder {
  return {
    id: "so-1",
    so_number: "SO-0001",
    client_id: "c-1",
    client_name: "Client",
    client_code: "FR-0001",
    status: "open",
    fabric_po_ids: [],
    fabric_lines: lines,
    ...partial,
  } as SalesOrder;
}

describe("fabric change alert gates", () => {
  it("does not fire on open order with no prints or POs", () => {
    assert.equal(shouldRecordFabricChangeAlert(order(), line()), false);
  });

  it("fires after fabric_pos_created", () => {
    assert.equal(
      shouldRecordFabricChangeAlert(order({ status: "fabric_pos_created" }), line()),
      true
    );
  });

  it("fires when A4 already printed", () => {
    const printed = line({ a4_printed_at: "2026-01-01T00:00:00.000Z" });
    assert.equal(shouldRecordFabricChangeAlert(order({}, [printed]), printed), true);
    assert.equal(lineHasPrintEvidence(printed), true);
  });

  it("fires when force is set (delete approve)", () => {
    assert.equal(shouldRecordFabricChangeAlert(order(), line(), { force: true }), true);
  });

  it("detects PO lock via fabric_po_ids", () => {
    assert.equal(orderHasFabricPosLock(order({ fabric_po_ids: ["po-1"] })), true);
  });

  it("detects meaningful field changes", () => {
    const before = snapshotFabricLine(line());
    const after = snapshotFabricLine(line({ fabric_number: "XYZ999", quantity: 3 }));
    assert.equal(fabricLineMeaningfullyChanged(before, after), true);
    assert.equal(fabricLineMeaningfullyChanged(before, before), false);
  });
});
