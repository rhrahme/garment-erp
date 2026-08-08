import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySiblingMeasurementHeal,
  findBestSiblingMeasurementSource,
  isMeasurementSheetEmpty,
} from "@/lib/pattern-library/heal-empty-measurements";
import type { ClientPattern, ClientPatternVersion } from "@/lib/types/pattern-library";

function version(
  id: string,
  measurements: ClientPatternVersion["measurements"]
): ClientPatternVersion {
  return {
    id,
    version: 1,
    is_final: false,
    trial_date: null,
    measurements,
    special_instructions: null,
    notes: null,
    files: [],
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
}

function pattern(
  id: string,
  garment: string,
  versions: ClientPatternVersion[],
  linked: string[] = []
): ClientPattern {
  return {
    id,
    pattern_ref: id,
    client_id: "client-1",
    client_code: "FR-0013-0004",
    client_name: "Abdullah Al Moussa",
    garment_type: garment,
    unit: "in",
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
    linked_fabric_line_ids: linked,
    files: [],
    versions,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
}

describe("heal empty measurements from siblings", () => {
  it("detects empty sheets", () => {
    assert.equal(
      isMeasurementSheetEmpty(
        pattern("a", "House Thobe", [version("v1", [])])
      ),
      true
    );
    assert.equal(
      isMeasurementSheetEmpty(
        pattern("a", "House Thobe", [
          version("v1", [
            {
              point_id: "p1",
              name: "Chest",
              remark: null,
              is_graded: true,
              base_value: null,
              target_value: null,
              sewn_value: null,
              adjustment: null,
              remarks: null,
            },
          ]),
        ])
      ),
      true
    );
  });

  it("picks the filled sibling for the same client + garment", () => {
    const empty = pattern("empty", "House Thobe", [version("v-empty", [])], ["line-1"]);
    const filled = pattern("filled", "House Thobe", [
      version("v-filled", [
        {
          point_id: "p1",
          name: "Chest",
          remark: null,
          is_graded: true,
          base_value: null,
          target_value: 27.5,
          sewn_value: null,
          adjustment: null,
          remarks: "note",
        },
      ]),
    ]);
    const otherGarment = pattern("other", "Jacket", [
      version("v-j", [
        {
          point_id: "p1",
          name: "Chest",
          remark: null,
          is_graded: true,
          base_value: null,
          target_value: 40,
          sewn_value: null,
          adjustment: null,
          remarks: null,
        },
      ]),
    ]);
    const best = findBestSiblingMeasurementSource([empty, filled, otherGarment], empty);
    assert.equal(best?.pattern.id, "filled");
  });

  it("copies sibling measurements onto the empty target", () => {
    const empty = pattern("empty", "House Thobe", [version("v-empty", [])]);
    const source = version("v-filled", [
      {
        point_id: "p1",
        name: "Chest",
        remark: null,
        is_graded: true,
        base_value: null,
        target_value: 27.5,
        sewn_value: null,
        adjustment: null,
        remarks: "keep",
      },
    ]);
    const healed = applySiblingMeasurementHeal(empty, source);
    assert.ok(healed);
    assert.equal(healed!.versions[0]!.measurements.length, 1);
    assert.equal(healed!.versions[0]!.measurements[0]!.target_value, 27.5);
    assert.equal(healed!.versions[0]!.measurements[0]!.remarks, "keep");
  });
});
