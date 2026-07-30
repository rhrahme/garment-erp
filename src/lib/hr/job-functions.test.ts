import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatJobFunctionsSummary,
  normalizeJobFunctions,
} from "@/lib/hr/job-functions";

describe("normalizeJobFunctions", () => {
  it("defaults missing/invalid values to empty", () => {
    assert.deepEqual(normalizeJobFunctions(undefined), []);
    assert.deepEqual(normalizeJobFunctions(null), []);
    assert.deepEqual(normalizeJobFunctions("cutter"), []);
    assert.deepEqual(normalizeJobFunctions(["nope", 1, null]), []);
  });

  it("dedupes and keeps catalog order", () => {
    assert.deepEqual(normalizeJobFunctions(["qc", "jacket_tailor", "qc", "cutter"]), [
      "jacket_tailor",
      "cutter",
      "qc",
    ]);
  });
});

describe("formatJobFunctionsSummary", () => {
  it("summarizes selection for the dropdown trigger", () => {
    assert.equal(formatJobFunctionsSummary([]), "Select roles...");
    assert.equal(formatJobFunctionsSummary(["cutter"]), "Cutter");
    assert.equal(formatJobFunctionsSummary(["jacket_tailor", "qc"]), "Jacket tailor, QC");
    assert.equal(formatJobFunctionsSummary(["jacket_tailor", "cutter", "qc"]), "3 roles");
  });
});
