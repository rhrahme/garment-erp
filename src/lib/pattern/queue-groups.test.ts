import assert from "node:assert/strict";
import { test } from "node:test";
import type { PatternJob, PatternJobRow } from "../types/pattern.ts";
import { groupPatternJobsBySalesOrder } from "./queue-groups.ts";

function job(partial: Partial<PatternJob> & Pick<PatternJob, "id" | "sales_order_id">): PatternJob {
  return {
    sales_order_line_id: `${partial.id}-line`,
    so_number: "SO-0100",
    client_id: "client-1",
    client_name: "Ada Client",
    client_code: "FR-0626-0001",
    garment_type: "shirt",
    piece_name: "Body",
    article_number: 1,
    fabric_number: "F-1",
    supplier: "Supplier",
    composition: null,
    gsm: null,
    width_cm: null,
    width_inches: null,
    color: null,
    meters: 2,
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
    ...partial,
  };
}

function row(
  partial: Partial<PatternJob> & Pick<PatternJob, "id" | "sales_order_id">,
  extras: Partial<Pick<PatternJobRow, "house_brand" | "order_delivery_date">> = {}
): PatternJobRow {
  return {
    job: job(partial),
    order_delivery_date: extras.order_delivery_date ?? "2026-08-01",
    house_brand: extras.house_brand ?? "Fouad Rahme",
  };
}

test("groupPatternJobsBySalesOrder collapses lines into one group per SO", () => {
  const groups = groupPatternJobsBySalesOrder([
    row({
      id: "j1",
      sales_order_id: "so-a",
      so_number: "SO-0101",
      article_number: 2,
      garment_type: "pants",
      updated_at: "2026-01-02T00:00:00.000Z",
    }),
    row({
      id: "j2",
      sales_order_id: "so-a",
      so_number: "SO-0101",
      article_number: 1,
      garment_type: "shirt",
      client_pattern_id: "cp-1",
      updated_at: "2026-01-03T00:00:00.000Z",
    }),
    row(
      {
        id: "j3",
        sales_order_id: "so-b",
        so_number: "SO-0102",
        client_name: "Other",
        client_code: "GL-0626-0002",
        garment_type: "jacket",
        updated_at: "2026-01-04T00:00:00.000Z",
      },
      { house_brand: "Gliani" }
    ),
  ]);

  assert.equal(groups.length, 2);

  const soA = groups.find((group) => group.sales_order_id === "so-a");
  assert.ok(soA);
  assert.equal(soA.job_count, 2);
  assert.equal(soA.fabric_line_count, 2);
  assert.deepEqual(soA.garment_types, ["pants", "shirt"]);
  assert.equal(soA.linked_pattern_count, 1);
  assert.equal(soA.unlinked_job_count, 1);
  assert.equal(soA.jobs[0]?.job.article_number, 1);
  assert.equal(soA.jobs[1]?.job.article_number, 2);
  assert.equal(soA.house_brand, "Fouad Rahme");

  const soB = groups.find((group) => group.sales_order_id === "so-b");
  assert.ok(soB);
  assert.equal(soB.job_count, 1);
  assert.deepEqual(soB.garment_types, ["jacket"]);
  assert.equal(soB.house_brand, "Gliani");
});

test("groupPatternJobsBySalesOrder prioritizes trial groups", () => {
  const groups = groupPatternJobsBySalesOrder([
    row({
      id: "j1",
      sales_order_id: "so-plain",
      so_number: "SO-1",
      trial_priority: false,
      updated_at: "2026-01-05T00:00:00.000Z",
    }),
    row({
      id: "j2",
      sales_order_id: "so-trial",
      so_number: "SO-2",
      trial_priority: true,
      updated_at: "2026-01-01T00:00:00.000Z",
    }),
  ]);

  assert.equal(groups[0]?.sales_order_id, "so-trial");
  assert.equal(groups[0]?.has_trial_priority, true);
});
