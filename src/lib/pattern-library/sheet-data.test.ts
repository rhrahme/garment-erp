import assert from "node:assert/strict";
import { test } from "node:test";
import { applySheetBaseMeasurements } from "./sheet-data.ts";
import type { BasePattern, ClientPatternVersion } from "../types/pattern-library.ts";

const BASE: BasePattern = {
  id: "bp-1",
  house_brand_id: "fouad-rahme",
  house_brand_code: "FR",
  cut_family: "Massimo",
  garment_type: "shorts",
  cut_variant: "Linen",
  name: "Massimo Linen Shorts",
  unit: "in",
  sizes: ["XL", "XXL"],
  points: [
    {
      point_id: "waist",
      name: "1/2 Waist",
      remark: null,
      is_graded: true,
      values: { XL: 18, XXL: 19.5 },
    },
    {
      point_id: "inseam",
      name: "Inseam",
      remark: null,
      is_graded: true,
      values: { XL: 10, XXL: 10.5 },
    },
  ],
  style_code: null,
  fabric: null,
  season: null,
  special_instructions: null,
  physical_pattern_kept: false,
  physical_pattern_location: null,
  files: [],
  source_file: null,
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function emptyVersion(): ClientPatternVersion {
  return {
    id: "cpv-1",
    version: 1,
    is_final: false,
    trial_date: null,
    measurements: [
      {
        point_id: "waist",
        name: "1/2 Waist",
        remark: null,
        is_graded: true,
        base_value: null,
        target_value: null,
        sewn_value: null,
        adjustment: null,
        remarks: null,
      },
    ],
    special_instructions: null,
    notes: null,
    files: [],
    created_by: null,
    updated_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

test("applySheetBaseMeasurements warns when base is missing (Ajlan-style)", () => {
  const result = applySheetBaseMeasurements(emptyVersion(), null, "2XL");
  assert.equal(result.resolved_base_size, null);
  assert.match(result.base_fill_warning ?? "", /Link a base pattern first/);
  assert.equal(result.version.measurements[0]?.base_value, null);
});

test("applySheetBaseMeasurements fills Base/Target via 2XL↔XXL match", () => {
  const result = applySheetBaseMeasurements(emptyVersion(), BASE, "2XL");
  assert.equal(result.resolved_base_size, "XXL");
  assert.equal(result.base_fill_warning, null);
  assert.equal(result.version.measurements[0]?.base_value, 19.5);
  assert.equal(result.version.measurements[0]?.target_value, 19.5);
  // Missing base points are appended.
  assert.equal(result.version.measurements.length, 2);
  assert.equal(result.version.measurements[1]?.base_value, 10.5);
});

test("applySheetBaseMeasurements warns when size is not on the base", () => {
  const result = applySheetBaseMeasurements(emptyVersion(), BASE, "S");
  assert.equal(result.resolved_base_size, null);
  assert.match(result.base_fill_warning ?? "", /Size S is not on the linked base/);
});
