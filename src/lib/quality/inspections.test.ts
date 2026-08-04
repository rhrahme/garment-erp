import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildQualityInspectionRecord,
  canCreateQualityInspection,
  parseQualityInspectionInput,
} from "./inspections.ts";

describe("canCreateQualityInspection", () => {
  it("allows admin, QC (client_manager), and factory manager", () => {
    assert.equal(canCreateQualityInspection({ isAdmin: true }), true);
    assert.equal(canCreateQualityInspection({ isClientManager: true }), true);
    assert.equal(canCreateQualityInspection({ isProductionOperator: true }), true);
  });

  it("blocks other roles", () => {
    assert.equal(canCreateQualityInspection({}), false);
    assert.equal(
      canCreateQualityInspection({
        isAdmin: false,
        isClientManager: false,
        isProductionOperator: false,
      }),
      false
    );
  });
});

describe("parseQualityInspectionInput", () => {
  it("accepts a valid payload and trims optional fields", () => {
    const parsed = parseQualityInspectionInput({
      inspection_date: "2026-08-04",
      sample_size: 125,
      result: "pass",
      notes: "  Within AQL 2.5  ",
      work_order_id: " wo-1 ",
      work_order_label: " FR-0001 / Client ",
    });
    assert.ok(parsed.ok);
    assert.equal(parsed.value.sample_size, 125);
    assert.equal(parsed.value.result, "pass");
    assert.equal(parsed.value.notes, "Within AQL 2.5");
    assert.equal(parsed.value.work_order_id, "wo-1");
    assert.equal(parsed.value.work_order_label, "FR-0001 / Client");
  });

  it("defaults inspection_date to now and empty optionals to null", () => {
    const parsed = parseQualityInspectionInput({ sample_size: "10", result: "rework" });
    assert.ok(parsed.ok);
    assert.ok(!Number.isNaN(new Date(parsed.value.inspection_date).getTime()));
    assert.equal(parsed.value.notes, null);
    assert.equal(parsed.value.work_order_id, null);
    assert.equal(parsed.value.work_order_label, null);
  });

  it("rejects unknown results", () => {
    const parsed = parseQualityInspectionInput({ sample_size: 10, result: "maybe" });
    assert.ok(!parsed.ok);
    assert.match(parsed.error, /result must be one of/);
  });

  it("rejects missing, zero, negative, or fractional sample sizes", () => {
    for (const sampleSize of [undefined, 0, -3, 2.5, "abc"]) {
      const parsed = parseQualityInspectionInput({
        sample_size: sampleSize,
        result: "pass",
      });
      assert.ok(!parsed.ok, `expected reject for sample_size=${String(sampleSize)}`);
      assert.match(parsed.error, /sample_size/);
    }
  });

  it("rejects invalid dates", () => {
    const parsed = parseQualityInspectionInput({
      inspection_date: "not-a-date",
      sample_size: 5,
      result: "fail",
    });
    assert.ok(!parsed.ok);
    assert.match(parsed.error, /inspection_date/);
  });
});

describe("buildQualityInspectionRecord", () => {
  it("stamps id, created_at, and created_by", () => {
    const parsed = parseQualityInspectionInput({ sample_size: 8, result: "fail" });
    assert.ok(parsed.ok);
    const record = buildQualityInspectionRecord(parsed.value, {
      createdBy: "hagan.qc@gmail.com",
    });
    assert.match(record.id, /^qi-/);
    assert.equal(record.created_by, "hagan.qc@gmail.com");
    assert.ok(!Number.isNaN(new Date(record.created_at).getTime()));
    assert.equal(record.result, "fail");
    assert.equal(record.sample_size, 8);
  });
});
