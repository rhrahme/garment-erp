import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GarmentTypeChange } from "@/lib/types/garment-type-changes";
import {
  buildGarmentTypeChangeFlagsByLineId,
  countUnacknowledgedGarmentTypeChanges,
} from "./garment-type-change-flags.ts";

function sampleChange(overrides: Partial<GarmentTypeChange> = {}): GarmentTypeChange {
  return {
    id: "gtc-1",
    changed_at: "2026-07-26T10:00:00.000Z",
    changed_by: "pattern@example.com",
    sales_order_id: "so-1",
    so_number: "SO-0101",
    sales_order_line_id: "line-1",
    client_id: "client-1",
    client_name: "Client",
    client_code: "CL01",
    fabric_number: "F123",
    article_number: 1,
    from_garment_type: "Shirt LS",
    to_garment_type: "Overshirt",
    note: null,
    pattern_job_id: null,
    admin_notified_at: "2026-07-26T10:01:00.000Z",
    acknowledged_at: null,
    acknowledged_by: null,
    ...overrides,
  };
}

describe("buildGarmentTypeChangeFlagsByLineId", () => {
  it("returns the latest change per line for an order", () => {
    const flags = buildGarmentTypeChangeFlagsByLineId(
      [
        sampleChange({
          id: "gtc-old",
          changed_at: "2026-07-25T10:00:00.000Z",
          from_garment_type: "Jacket",
          to_garment_type: "Shirt LS",
        }),
        sampleChange({
          id: "gtc-new",
          changed_at: "2026-07-26T10:00:00.000Z",
          from_garment_type: "Shirt LS",
          to_garment_type: "Overshirt",
        }),
        sampleChange({
          id: "gtc-other-line",
          sales_order_line_id: "line-2",
          article_number: 2,
          from_garment_type: "Trousers",
          to_garment_type: "Shorts",
        }),
      ],
      "so-1"
    );

    assert.equal(flags["line-1"]?.change_id, "gtc-new");
    assert.equal(flags["line-1"]?.to_garment_type, "Overshirt");
    assert.equal(flags["line-2"]?.from_garment_type, "Trousers");
  });

  it("filters by sales order id", () => {
    const flags = buildGarmentTypeChangeFlagsByLineId(
      [
        sampleChange({ sales_order_id: "so-1", sales_order_line_id: "line-1" }),
        sampleChange({ id: "gtc-2", sales_order_id: "so-2", sales_order_line_id: "line-9" }),
      ],
      "so-1"
    );

    assert.equal(Object.keys(flags).length, 1);
    assert.ok(flags["line-1"]);
    assert.equal(flags["line-9"], undefined);
  });
});

describe("countUnacknowledgedGarmentTypeChanges", () => {
  it("counts only changes without acknowledged_at", () => {
    assert.equal(
      countUnacknowledgedGarmentTypeChanges([
        sampleChange({ id: "gtc-1", acknowledged_at: null }),
        sampleChange({
          id: "gtc-2",
          acknowledged_at: "2026-07-26T11:00:00.000Z",
          acknowledged_by: "admin@example.com",
        }),
      ]),
      1
    );
  });
});
