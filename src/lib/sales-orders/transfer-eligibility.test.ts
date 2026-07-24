import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessFabricTransferEligibility } from "./transfer-eligibility.ts";
import type { FabricReceipt } from "../types/fabric-receipts.ts";
import type { ProductionWorkOrder } from "../types/production.ts";

function receipt(overrides: Partial<FabricReceipt> = {}): FabricReceipt {
  return {
    id: "fr-1",
    sales_order_id: "so-1",
    so_number: "SO-1",
    sales_order_line_id: "line-1",
    client_id: "c1",
    client_code: "AJL",
    client_name: "Client A",
    garment_type: "Jacket",
    fabric_number: "722042",
    supplier_id: "drapers",
    supplier_name: "Drapers",
    fabric_meters: 2,
    composition: null,
    weight_gsm: null,
    status: "received",
    fabric_prep_type: null,
    fabric_prep_step: null,
    received_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    handed_off_at: null,
    ...overrides,
  };
}

function wo(status: ProductionWorkOrder["status"]): ProductionWorkOrder {
  return {
    id: `pwo-${status}`,
    sticker_code: "AJL-SO-1-L01-JKT",
    sales_order_id: "so-1",
    so_number: "SO-1",
    sales_order_line_id: "line-1",
    client_id: "c1",
    client_code: "AJL",
    client_name: "Client A",
    garment_type: "Jacket",
    piece_name: "Jacket",
    fabric_number: "722042",
    supplier_id: "drapers",
    supplier_name: "Drapers",
    fabric_meters: 2,
    status,
    fabric_prep_type: null,
    fabric_prep_step: null,
    received_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    completed_at: status === "completed" ? "2026-07-02T00:00:00.000Z" : null,
  };
}

describe("assessFabricTransferEligibility", () => {
  it("allows untouched lines with no warning", () => {
    const result = assessFabricTransferEligibility({
      client_name: "Client A",
      receipt: null,
      work_orders: [],
    });
    assert.equal(result.code, "ok");
    assert.equal(result.allowed, true);
    assert.equal(result.requires_receiving_ack, false);
    assert.equal(result.blocked, false);
  });

  it("warns for wash / iron receiving pipeline", () => {
    const result = assessFabricTransferEligibility({
      client_name: "Client A",
      receipt: receipt({
        status: "fabric_prep",
        fabric_prep_type: "wash_iron",
        fabric_prep_step: "wash",
      }),
      work_orders: [],
    });
    assert.equal(result.code, "receiving_pipeline");
    assert.equal(result.allowed, true);
    assert.equal(result.requires_receiving_ack, true);
    assert.match(result.message, /Client A/);
    assert.match(result.stage_label, /wash|Wash/i);
  });

  it("warns for received-but-not-prepped fabric", () => {
    const result = assessFabricTransferEligibility({
      client_name: "Client A",
      receipt: receipt({ status: "received" }),
      work_orders: [],
    });
    assert.equal(result.code, "receiving_pipeline");
    assert.equal(result.requires_receiving_ack, true);
  });

  it("blocks sewing+ production with no override", () => {
    const result = assessFabricTransferEligibility({
      client_name: "Client A",
      receipt: receipt({ status: "handed_off", handed_off_at: "2026-07-02T00:00:00.000Z" }),
      work_orders: [wo("sewing")],
    });
    assert.equal(result.code, "active_production");
    assert.equal(result.blocked, true);
    assert.equal(result.admin_override_available, false);
    assert.match(result.message, /production/i);
    assert.ok(result.remediation);
  });

  it("offers Admin override for cutting-only work orders", () => {
    const result = assessFabricTransferEligibility({
      client_name: "Client A",
      receipt: receipt({ status: "handed_off", handed_off_at: "2026-07-02T00:00:00.000Z" }),
      work_orders: [wo("cutting"), wo("cutting")],
    });
    assert.equal(result.code, "cutting_override");
    assert.equal(result.admin_override_available, true);
    assert.equal(result.blocked, true);
    assert.equal(result.active_work_order_count, 2);
  });

  it("offers Admin override for handed-off with no active WOs", () => {
    const result = assessFabricTransferEligibility({
      client_name: "Client A",
      receipt: receipt({ status: "handed_off", handed_off_at: "2026-07-02T00:00:00.000Z" }),
      work_orders: [wo("completed")],
    });
    assert.equal(result.code, "handed_off");
    assert.equal(result.admin_override_available, true);
  });
});
