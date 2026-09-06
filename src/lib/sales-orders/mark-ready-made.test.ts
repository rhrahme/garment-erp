import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PatternJob } from "../types/pattern.ts";
import type { SalesOrder } from "../types/sales-orders.ts";
import {
  applyReadyMadeBrandToOrder,
  cancelPatternJobsForReadyMadeOrders,
  findReadyMadeBrand,
} from "./mark-ready-made.ts";

describe("findReadyMadeBrand", () => {
  it("matches Boggi by label or alias", () => {
    assert.equal(findReadyMadeBrand("Boggi")?.id, "boggi");
    assert.equal(findReadyMadeBrand("boggy")?.id, "boggi");
  });
});

describe("applyReadyMadeBrandToOrder", () => {
  it("points the order at the Boggi retail account and keeps the SO number", () => {
    const order = {
      id: "so-1",
      so_number: "SO-2026-0150",
      client_id: "boggi-overcoat-2",
      client_code: "FR-0926-0064",
      client_name: "Boggi Overcoat",
      retail_brand: null,
      product_article: null,
      notes: null,
      fabric_lines: [{ garment_type: "Overcoat" }],
    } as unknown as SalesOrder;
    const brand = findReadyMadeBrand("Boggi");
    assert.ok(brand);
    const next = applyReadyMadeBrandToOrder(order, brand, "Overcoat");
    assert.equal(next.so_number, "SO-2026-0150");
    assert.equal(next.retail_brand, "Boggi");
    assert.equal(next.client_id, "cu-retail-boggi");
    assert.equal(next.client_code, "RM-BO");
    assert.equal(next.client_name, "Boggi");
    assert.equal(next.product_article, "Overcoat");
    assert.match(next.notes ?? "", /Ready-Made/);
  });
});

describe("cancelPatternJobsForReadyMadeOrders", () => {
  it("cancels pending jobs on the moved order only", () => {
    const jobs = [
      { id: "pj-1", sales_order_id: "so-1", status: "pending", notes: null, updated_at: "a" },
      { id: "pj-2", sales_order_id: "so-2", status: "pending", notes: null, updated_at: "a" },
      { id: "pj-3", sales_order_id: "so-1", status: "cancelled", notes: null, updated_at: "a" },
    ] as PatternJob[];
    const result = cancelPatternJobsForReadyMadeOrders(jobs, new Set(["so-1"]), "now");
    assert.deepEqual(result.cancelled_ids, ["pj-1"]);
    assert.equal(result.jobs[0]!.status, "cancelled");
    assert.equal(result.jobs[1]!.status, "pending");
    assert.equal(result.jobs[2]!.status, "cancelled");
  });
});
