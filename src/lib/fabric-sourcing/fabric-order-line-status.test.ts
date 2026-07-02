import { describe, expect, it } from "vitest";
import {
  getPendingFabricOrderLines,
  isFabricOrderFullySent,
  isFabricOrderLineSent,
  lineIdsByPoIdFromSelection,
} from "@/lib/fabric-sourcing/fabric-order-line-status";
import type { PurchaseOrder, PurchaseOrderLine } from "@/lib/types/fabric-sourcing";

function line(id: string, emailed_at: string | null = null): PurchaseOrderLine {
  return {
    id,
    fabric_number: "F001",
    quantity_ordered: 2,
    unit_price: 10,
    client_reference: null,
    emailed_at,
  };
}

function order(overrides: Partial<PurchaseOrder> & { lines?: PurchaseOrderLine[] }): PurchaseOrder {
  return {
    id: "po-1",
    po_number: "PO-2026-0001",
    supplier_id: "loro-piana",
    status: "draft",
    order_date: "2026-01-01",
    expected_date: null,
    total_amount: 20,
    client_reference: null,
    emailed_at: null,
    email_to: null,
    expected_carrier: "DHL",
    lines: [],
    ...overrides,
  };
}

describe("fabric-order-line-status", () => {
  it("treats legacy fully-sent POs as all lines sent", () => {
    const po = order({
      emailed_at: "2026-01-02T00:00:00Z",
      lines: [line("l1"), line("l2")],
    });
    expect(isFabricOrderLineSent(po.lines![0]!, po)).toBe(true);
    expect(getPendingFabricOrderLines(po)).toHaveLength(0);
    expect(isFabricOrderFullySent(po)).toBe(true);
  });

  it("keeps unsent lines pending after a partial send", () => {
    const po = order({
      lines: [line("l1", "2026-01-02T00:00:00Z"), line("l2")],
    });
    expect(getPendingFabricOrderLines(po).map((l) => l.id)).toEqual(["l2"]);
    expect(isFabricOrderFullySent(po)).toBe(false);
  });

  it("groups selected line ids by PO", () => {
    const poA = order({ id: "po-a", lines: [line("l1"), line("l2")] });
    const poB = order({ id: "po-b", lines: [line("l3")] });
    const selected = new Set(["l1", "l3"]);
    expect(lineIdsByPoIdFromSelection([poA, poB], selected)).toEqual({
      "po-a": ["l1"],
      "po-b": ["l3"],
    });
  });
});
