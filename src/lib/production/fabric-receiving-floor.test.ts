import assert from "node:assert/strict";
import { test } from "node:test";
import type { FabricReceipt } from "../types/fabric-receipts.ts";
import type { ProductionWorkOrder } from "../types/production.ts";
import {
  isFabricReceivingFloorLine,
  isFabricReceivingOrderActivated,
  isLineProductionCompleted,
  isLineStitchedOrDone,
  isSalesOrderFabricReceivingSettled,
  resolveFabricLineReceiveStatus,
} from "./fabric-receiving-floor.ts";

function receipt(status: FabricReceipt["status"]): FabricReceipt {
  return {
    id: "fr-1",
    sales_order_id: "so-1",
    so_number: "SO-TEST",
    sales_order_line_id: "line-1",
    client_id: "c-1",
    client_code: "TST",
    client_name: "Test Client",
    garment_type: "Jacket",
    fabric_number: "F-1",
    supplier_id: "sup-1",
    supplier_name: "Supplier",
    fabric_meters: 2,
    composition: null,
    weight_gsm: null,
    status,
    fabric_prep_type: null,
    fabric_prep_step: null,
    received_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    handed_off_at: null,
  };
}

function workOrder(
  status: ProductionWorkOrder["status"],
  lineId = "line-1"
): ProductionWorkOrder {
  return {
    id: `pwo-${lineId}-${status}`,
    sticker_code: `STICKER-${lineId}`,
    sales_order_id: "so-1",
    so_number: "SO-TEST",
    sales_order_line_id: lineId,
    client_id: "c-1",
    client_code: "TST",
    client_name: "Test Client",
    garment_type: "Jacket",
    piece_name: "Jacket",
    fabric_number: "F-1",
    supplier_id: "sup-1",
    supplier_name: "Supplier",
    fabric_meters: 2,
    status,
    fabric_prep_type: null,
    fabric_prep_step: null,
    received_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    completed_at: status === "completed" ? "2026-02-01T00:00:00.000Z" : null,
  };
}

test("resolveFabricLineReceiveStatus prefers production work orders over stale receipts", () => {
  assert.equal(resolveFabricLineReceiveStatus(receipt("received"), [workOrder("cutting")]), "handed_off");
  assert.equal(resolveFabricLineReceiveStatus(receipt("fabric_prep"), [workOrder("completed")]), "handed_off");
  assert.equal(resolveFabricLineReceiveStatus(receipt("received"), []), "received");
  assert.equal(resolveFabricLineReceiveStatus(undefined, []), "pending");
});

test("isFabricReceivingFloorLine hides handed-off and pre-PO pending lines", () => {
  const openOrder = { status: "open" as const };
  const poOrder = { status: "fabric_pos_created" as const };
  const bareLine = { a4_printed_at: null, prep_stickers_printed_at: null };
  const printedLine = { a4_printed_at: "2026-01-01T00:00:00.000Z", prep_stickers_printed_at: null };

  assert.equal(isFabricReceivingFloorLine("handed_off", poOrder, bareLine), false);
  assert.equal(isFabricReceivingFloorLine("pending", openOrder, bareLine), false);
  assert.equal(isFabricReceivingFloorLine("pending", poOrder, bareLine), true);
  assert.equal(isFabricReceivingFloorLine("pending", openOrder, printedLine), true);
  assert.equal(isFabricReceivingFloorLine("received", openOrder, bareLine), true);
  assert.equal(isFabricReceivingFloorLine("fabric_prep", openOrder, bareLine), true);
  assert.equal(
    isFabricReceivingFloorLine("pending", openOrder, bareLine, { orderActivated: true }),
    true
  );
});

test("QC-added unprinted pending sibling stays visible on activated orders", () => {
  const order = {
    status: "open" as const,
    fabric_lines: [
      { id: "line-1", a4_printed_at: "2026-01-01T00:00:00.000Z", prep_stickers_printed_at: null },
      { id: "line-2", a4_printed_at: null, prep_stickers_printed_at: null },
    ],
  };
  const statuses = new Map([
    ["line-1", "pending" as const],
    ["line-2", "pending" as const],
  ]);
  assert.equal(isFabricReceivingOrderActivated(order, statuses), true);
  assert.equal(
    isSalesOrderFabricReceivingSettled(order, statuses, []),
    false,
    "unprinted QC add on an A4-printed order must not settle the order"
  );
});

test("stitched/completed helpers match production done stages", () => {
  assert.equal(isLineProductionCompleted([workOrder("completed")]), true);
  assert.equal(isLineProductionCompleted([workOrder("sewing")]), false);
  assert.equal(isLineStitchedOrDone([workOrder("sewing")]), true);
  assert.equal(isLineStitchedOrDone([workOrder("cutting")]), false);
  assert.equal(isLineStitchedOrDone([]), false);
});

test("isSalesOrderFabricReceivingSettled keeps partial stitch visible when siblings need receive", () => {
  const order = {
    status: "open" as const,
    fabric_lines: [
      { id: "line-1", a4_printed_at: "2026-01-01T00:00:00.000Z", prep_stickers_printed_at: null },
      { id: "line-2", a4_printed_at: "2026-01-01T00:00:00.000Z", prep_stickers_printed_at: null },
    ],
  };
  const statuses = new Map([
    ["line-1", "handed_off" as const],
    ["line-2", "received" as const],
  ]);
  assert.equal(
    isSalesOrderFabricReceivingSettled(order, statuses, [workOrder("completed", "line-1")]),
    false
  );
});

test("isSalesOrderFabricReceivingSettled when all lines past floor and production stitched", () => {
  const order = {
    status: "open" as const,
    fabric_lines: [
      { id: "line-1", a4_printed_at: "2026-01-01T00:00:00.000Z", prep_stickers_printed_at: null },
      { id: "line-2", a4_printed_at: "2026-01-01T00:00:00.000Z", prep_stickers_printed_at: null },
    ],
  };
  const statuses = new Map([
    ["line-1", "handed_off" as const],
    ["line-2", "handed_off" as const],
  ]);
  assert.equal(
    isSalesOrderFabricReceivingSettled(order, statuses, [
      workOrder("completed", "line-1"),
      workOrder("completed", "line-2"),
    ]),
    true
  );
  assert.equal(
    isSalesOrderFabricReceivingSettled(order, statuses, [
      workOrder("cutting", "line-1"),
      workOrder("cutting", "line-2"),
    ]),
    false
  );
  assert.equal(
    isSalesOrderFabricReceivingSettled({ ...order, status: "complete" }, statuses, [
      workOrder("cutting", "line-1"),
    ]),
    true
  );
});

test("handed-off siblings keep later unprinted pending QC adds from settling", () => {
  const order = {
    status: "open" as const,
    fabric_lines: [
      { id: "line-1", a4_printed_at: "2026-01-01T00:00:00.000Z", prep_stickers_printed_at: null },
      { id: "line-2", a4_printed_at: null, prep_stickers_printed_at: null },
    ],
  };
  const statuses = new Map([
    ["line-1", "handed_off" as const],
    ["line-2", "pending" as const],
  ]);
  assert.equal(
    isSalesOrderFabricReceivingSettled(order, statuses, [workOrder("completed", "line-1")]),
    false
  );
});
