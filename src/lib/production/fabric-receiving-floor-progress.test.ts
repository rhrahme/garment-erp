import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countFloorProgress,
  filterOrdersWithFloorProgress,
  floorProgressBucketForLine,
  formatFloorProgressSummary,
  lineHasFloorProgressScan,
  orderHasFloorProgress,
} from "./fabric-receiving-floor-progress.ts";
import type { FabricReceivingLineRow, FabricReceivingOrderRow } from "../types/fabric-receipts.ts";

function line(
  overrides: Partial<FabricReceivingLineRow> & Pick<FabricReceivingLineRow, "sales_order_line_id" | "status">
): FabricReceivingLineRow {
  return {
    receipt_id: null,
    article_number: 1,
    garment_type: "Trouser",
    fabric_number: "L01-TR",
    supplier_id: "sup-1",
    supplier_name: "Supplier",
    fabric_meters: 2,
    composition: null,
    weight_gsm: null,
    width_cm: null,
    width_inches: null,
    fabric_cut_code: "CUT-1",
    qr_payload: "",
    stickers: [],
    received_at: null,
    updated_at: null,
    fabric_prep_type: null,
    fabric_prep_step: null,
    scan_stage: "pending",
    scan_stage_label: "Pending",
    has_defect_report: false,
    open_defect_count: 0,
    ...overrides,
  };
}

function order(
  overrides: Partial<FabricReceivingOrderRow> &
    Pick<FabricReceivingOrderRow, "sales_order_id" | "so_number" | "lines">
): FabricReceivingOrderRow {
  return {
    client_name: "Khaled",
    client_code: "FR-0626-0037",
    order_date: "2026-06-01",
    is_archived: false,
    order_status: "open",
    pending_line_count: 0,
    active_line_count: 0,
    ...overrides,
  };
}

test("floorProgressBucketForLine maps receive → wash/soak/drying/iron → done", () => {
  assert.equal(floorProgressBucketForLine("pending", null), "pending");
  assert.equal(floorProgressBucketForLine("received", null), "received");
  assert.equal(floorProgressBucketForLine("fabric_prep", "wash"), "washing");
  assert.equal(floorProgressBucketForLine("fabric_prep", "soak"), "soaking");
  assert.equal(floorProgressBucketForLine("fabric_prep", "drying"), "drying");
  assert.equal(floorProgressBucketForLine("fabric_prep", "iron"), "ironing");
  assert.equal(floorProgressBucketForLine("fabric_prep", null), "ironing");
  assert.equal(floorProgressBucketForLine("handed_off", null), "done");
});

test("orderHasFloorProgress is quiet until at least one scan", () => {
  const quiet = order({
    sales_order_id: "so-quiet",
    so_number: "SO-2026-0001",
    lines: [
      line({ sales_order_line_id: "l1", status: "pending" }),
      line({ sales_order_line_id: "l2", status: "pending" }),
    ],
  });
  const started = order({
    sales_order_id: "so-started",
    so_number: "SO-2026-0121",
    lines: [
      line({ sales_order_line_id: "l1", status: "pending" }),
      line({
        sales_order_line_id: "l2",
        status: "received",
        fabric_cut_code: "FR-0626-0037-L01",
        scan_stage: "received",
        scan_stage_label: "Fabric received",
      }),
    ],
  });

  assert.equal(lineHasFloorProgressScan(quiet.lines[0]!), false);
  assert.equal(orderHasFloorProgress(quiet), false);
  assert.equal(orderHasFloorProgress(started), true);
  assert.equal(filterOrdersWithFloorProgress([quiet, started]).length, 1);
  assert.equal(filterOrdersWithFloorProgress([quiet, started])[0]!.so_number, "SO-2026-0121");
});

test("countFloorProgress and summary keep unfinished siblings visible in totals", () => {
  const lines = [
    line({ sales_order_line_id: "l1", status: "pending" }),
    line({ sales_order_line_id: "l2", status: "received" }),
    line({ sales_order_line_id: "l3", status: "fabric_prep", fabric_prep_step: "wash" }),
    line({ sales_order_line_id: "l4", status: "fabric_prep", fabric_prep_step: "iron" }),
    line({ sales_order_line_id: "l5", status: "handed_off" }),
  ];
  const counts = countFloorProgress(lines);
  assert.deepEqual(counts, {
    total: 5,
    pending: 1,
    received: 1,
    washing: 1,
    soaking: 0,
    drying: 0,
    ironing: 1,
    done: 1,
  });
  assert.equal(
    formatFloorProgressSummary(counts),
    "5 fabrics · 1 received · 1 washing · 1 ironing · 1 done"
  );
});

test("formatFloorProgressSummary includes drying only when present", () => {
  const withDrying = countFloorProgress([
    line({ sales_order_line_id: "l1", status: "fabric_prep", fabric_prep_step: "drying" }),
    line({ sales_order_line_id: "l2", status: "fabric_prep", fabric_prep_step: "wash" }),
    line({ sales_order_line_id: "l3", status: "received" }),
  ]);
  assert.equal(withDrying.drying, 1);
  assert.equal(
    formatFloorProgressSummary(withDrying),
    "3 fabrics · 1 received · 1 washing · 1 drying · 0 ironing · 0 done"
  );
});

test("formatFloorProgressSummary includes soaking only when present", () => {
  const withSoak = countFloorProgress([
    line({ sales_order_line_id: "l1", status: "fabric_prep", fabric_prep_step: "soak" }),
    line({ sales_order_line_id: "l2", status: "received" }),
  ]);
  assert.equal(
    formatFloorProgressSummary(withSoak),
    "2 fabrics · 1 received · 0 washing · 1 soaking · 0 ironing · 0 done"
  );
});
