import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PatternJob } from "@/lib/types/pattern";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";
import {
  detectPatternSalesOrderMismatch,
  extractClickUpTaskIds,
  orphanPatternJobsToCancel,
} from "./pattern-so-mismatch.ts";

function fabricLine(id: string): SalesOrderFabricLine {
  return {
    id,
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
  };
}

function order(overrides: Partial<SalesOrder> & Pick<SalesOrder, "id">): SalesOrder {
  return {
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
    fabric_lines: [],
    fabric_po_ids: [],
    ...overrides,
  };
}

function patternJob(
  overrides: Partial<PatternJob> & Pick<PatternJob, "id" | "sales_order_line_id">
): PatternJob {
  return {
    sales_order_id: "so-1",
    so_number: "SO-2026-0001",
    client_id: "client-1",
    client_name: "Test Client",
    client_code: "GL-0001",
    garment_type: "Jacket",
    piece_name: "Blazers",
    article_number: 1,
    fabric_number: "123",
    supplier: "Supplier",
    composition: "100% Wool",
    gsm: 280,
    width_cm: 150,
    width_inches: null,
    color: null,
    meters: 2.5,
    status: "pending",
    assigned_to: null,
    pattern_code: null,
    pattern_size_notes: null,
    trial_priority: false,
    blocked_reason: null,
    notes: null,
    fittings: [],
    revisions: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("extractClickUpTaskIds", () => {
  it("parses task ids from ClickUp notes", () => {
    const ids = extractClickUpTaskIds("ClickUp: Blair Maxwell (86exhyjr1)");
    assert.deepEqual(ids, ["86exhyjr1"]);
  });

  it("includes id from so-cu- order id", () => {
    const ids = extractClickUpTaskIds(null, "so-cu-86exhyjr1");
    assert.deepEqual(ids, ["86exhyjr1"]);
  });
});

describe("orphanPatternJobsToCancel", () => {
  it("returns active jobs whose line id is not on the order", () => {
    const so = order({
      id: "so-1",
      fabric_lines: [fabricLine("line-a")],
    });
    const jobs = [
      patternJob({ id: "pj-1", sales_order_line_id: "line-a" }),
      patternJob({ id: "pj-2", sales_order_line_id: "line-orphan" }),
      patternJob({ id: "pj-3", sales_order_line_id: "line-orphan", status: "cancelled" }),
      patternJob({ id: "pj-4", sales_order_line_id: "line-orphan", status: "completed" }),
    ];

    const orphans = orphanPatternJobsToCancel(so, jobs);
    assert.deepEqual(orphans.map((job) => job.id), ["pj-2"]);
  });
});

describe("detectPatternSalesOrderMismatch", () => {
  it("reports no mismatch when counts and line ids align", () => {
    const so = order({
      id: "so-1",
      fabric_lines: [fabricLine("line-a"), fabricLine("line-b")],
    });
    const jobs = [
      patternJob({ id: "pj-1", sales_order_line_id: "line-a" }),
      patternJob({ id: "pj-2", sales_order_line_id: "line-b" }),
    ];

    const mismatch = detectPatternSalesOrderMismatch(so, jobs);
    assert.equal(mismatch.has_mismatch, false);
    assert.equal(mismatch.fabric_line_count, 2);
    assert.equal(mismatch.active_pattern_job_count, 2);
    assert.deepEqual(mismatch.stale_line_ids, []);
    assert.deepEqual(mismatch.orphan_job_ids, []);
  });

  it("reports mismatch when active job count differs from fabric lines", () => {
    const so = order({
      id: "so-1",
      fabric_lines: [fabricLine("line-a"), fabricLine("line-b")],
    });
    const jobs = [
      patternJob({ id: "pj-1", sales_order_line_id: "line-a" }),
      patternJob({ id: "pj-2", sales_order_line_id: "line-b" }),
      patternJob({ id: "pj-3", sales_order_line_id: "line-c" }),
    ];

    const mismatch = detectPatternSalesOrderMismatch(so, jobs);
    assert.equal(mismatch.has_mismatch, true);
    assert.equal(mismatch.fabric_line_count, 2);
    assert.equal(mismatch.active_pattern_job_count, 3);
    assert.deepEqual(mismatch.stale_line_ids, ["line-c"]);
    assert.deepEqual(mismatch.orphan_job_ids, ["pj-3"]);
  });

  it("ignores cancelled jobs in active count", () => {
    const so = order({
      id: "so-1",
      fabric_lines: [fabricLine("line-a")],
    });
    const jobs = [
      patternJob({ id: "pj-1", sales_order_line_id: "line-a" }),
      patternJob({ id: "pj-2", sales_order_line_id: "line-orphan", status: "cancelled" }),
    ];

    const mismatch = detectPatternSalesOrderMismatch(so, jobs);
    assert.equal(mismatch.has_mismatch, false);
    assert.equal(mismatch.active_pattern_job_count, 1);
  });

  it("marks ClickUp-imported orders from notes", () => {
    const so = order({
      id: "so-cu-86exhyjr1",
      notes: "ClickUp: Blair Maxwell (86exhyjr1)",
      fabric_lines: [fabricLine("line-a")],
    });

    const mismatch = detectPatternSalesOrderMismatch(so, [
      patternJob({ id: "pj-1", sales_order_line_id: "line-a" }),
    ]);

    assert.equal(mismatch.imported_from_clickup, true);
    assert.deepEqual(mismatch.clickup_task_ids, ["86exhyjr1"]);
  });
});
