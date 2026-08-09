import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyCmUnitRelabel,
  applyConvertedCmBackToInches,
  applyInchUnitRelabel,
  applyRestoreStoredMeasurementUnit,
  looksLikeConvertedCmFromInches,
  looksLikeStoredCmMislabeledAsInches,
  looksLikeStoredInchMeasurements,
} from "@/lib/pattern-library/heal-measurement-unit";
import type { ClientPattern, ClientPatternVersion } from "@/lib/types/pattern-library";

function pattern(
  unit: "in" | "cm",
  values: number[]
): ClientPattern {
  const version: ClientPatternVersion = {
    id: "v1",
    version: 1,
    is_final: false,
    trial_date: null,
    measurements: values.map((value, index) => ({
      point_id: `p${index}`,
      name: `Point ${index}`,
      remark: null,
      is_graded: true,
      base_value: null,
      target_value: value,
      sewn_value: null,
      adjustment: null,
      remarks: null,
    })),
    special_instructions: null,
    notes: null,
    files: [],
    created_by: null,
    updated_by: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
  return {
    id: "cp-1",
    pattern_ref: "TEST",
    client_id: "c1",
    client_code: "FR-0001",
    client_name: "Test",
    garment_type: "House Thobe",
    unit,
    base_pattern_id: null,
    base_size: null,
    fabric: null,
    house_brand_id: null,
    house_brand_code: null,
    description: null,
    notes: null,
    special_instructions: null,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    final_version_id: null,
    linked_fabric_line_ids: [],
    files: [],
    versions: [version],
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
}

test("Moussa-style inch fractions are detected as stored inches", () => {
  const sheet = pattern("cm", [58.625, 27.75, 28.5, 25.25, 30.625, 34.125, 20.75]);
  assert.equal(looksLikeStoredInchMeasurements(sheet), true);
});

test("relabel cm -> in keeps the numeric cells unchanged", () => {
  const sheet = pattern("cm", [58.625, 27.75, 28.5, 25.25]);
  const next = applyInchUnitRelabel(sheet);
  assert.ok(next);
  assert.equal(next!.unit, "in");
  assert.equal(next!.versions[0]!.measurements[0]!.target_value, 58.625);
});

test("already-inch sheets are left alone", () => {
  const sheet = pattern("in", [58.625, 27.75, 28.5, 25.25]);
  assert.equal(applyInchUnitRelabel(sheet), null);
});

test("accidental cm convert (Moussa 148.91) restores to inches", () => {
  const sheet = pattern("cm", [148.91, 70.49, 72.39, 64.14, 77.79, 86.68, 52.71]);
  assert.equal(looksLikeConvertedCmFromInches(sheet), true);
  const next = applyConvertedCmBackToInches(sheet);
  assert.ok(next);
  assert.equal(next!.unit, "in");
  assert.equal(next!.versions[0]!.measurements[0]!.target_value, 58.625);
});

test("Khaled-style CM typed as inches is detected and relabeled without converting", () => {
  // Length 76, Chest 63, Slv 66.5 — often on 1/16" too, so inch heuristic alone
  // must not block cm relabel when several values sit in the cm band (>= 60).
  const sheet = pattern("in", [76, 63, 16.5, 66.5, 13.3, 81.5, 23.3, 42.7, 48, 42.5]);
  assert.equal(looksLikeStoredCmMislabeledAsInches(sheet), true);
  const next = applyCmUnitRelabel(sheet);
  assert.ok(next);
  assert.equal(next!.unit, "cm");
  assert.equal(next!.versions[0]!.measurements[0]!.target_value, 76);
});

test("true cm sheets labeled cm are not flipped to inches by sixteenth coincidence", () => {
  const sheet = pattern("cm", [76, 63, 16.5, 66.5, 13.3, 81.5, 23.3, 42.7, 48, 42.5]);
  assert.equal(applyInchUnitRelabel(sheet), null);
});

test("true cm sheets are not converted to inches by accidental-convert heal", () => {
  const sheet = pattern("cm", [76, 63, 16.5, 66.5, 13.3, 81.5, 23.3, 42.7, 48, 42.5]);
  assert.equal(applyConvertedCmBackToInches(sheet), null);
  assert.equal(applyRestoreStoredMeasurementUnit(sheet), null);
});

test("true inch sheets labeled in are not flipped to cm", () => {
  const sheet = pattern("in", [58.625, 27.75, 28.5, 25.25, 30.625, 34.125, 20.75]);
  assert.equal(looksLikeStoredInchMeasurements(sheet), true);
  assert.equal(looksLikeStoredCmMislabeledAsInches(sheet), false);
  assert.equal(applyCmUnitRelabel(sheet), null);
});
