import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOGGI_OVERCOAT_SPEC_FILENAME,
  boggiOvercoatPatternRef,
  buildBasePointsFromSizeRun,
  pickBestSizeRunSheet,
  stockSizeFromFabric,
} from "@/lib/pattern-library/promote-ready-made-size-run";
import type { ClientPattern } from "@/lib/types/pattern-library";

function sheet(size: string, chest: number, extra?: Partial<ClientPattern>): ClientPattern {
  return {
    id: `cp-${size}`,
    pattern_ref: `OVERCOAT-STOCK-${size}`,
    house_brand_id: "gliani",
    house_brand_code: "GL",
    client_id: "boggi-overcoat",
    client_code: "GL-0926-0014",
    client_name: "Boggi Overcoat",
    garment_type: "Overcoat",
    fabric: `Stock-${size}`,
    description: null,
    unit: "in",
    base_pattern_id: null,
    base_size: null,
    special_instructions: null,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    files: [],
    versions: [
      {
        id: `cpv-${size}`,
        version: 1,
        is_final: true,
        trial_date: null,
        notes: null,
        files: [],
        created_at: "2026-09-02T00:00:00.000Z",
        created_by: "pattern",
        updated_at: "2026-09-03T00:00:00.000Z",
        updated_by: "pattern",
        special_instructions: null,
        measurements: [
          {
            point_id: "1-2-shest-width",
            name: "1/2 Chest Width",
            remark: null,
            is_graded: true,
            base_value: null,
            target_value: chest,
            sewn_value: null,
            adjustment: null,
            remarks: null,
          },
        ],
      },
    ],
    linked_fabric_line_ids: extra?.linked_fabric_line_ids ?? [],
    notes: null,
    created_at: "2026-09-02T00:00:00.000Z",
    updated_at: "2026-09-03T00:00:00.000Z",
    ...extra,
  };
}

describe("stockSizeFromFabric and names", () => {
  it("reads Stock-46 as size 46 and names the sheet Boggi Overcoat 46", () => {
    assert.equal(stockSizeFromFabric("Stock-46"), "46");
    assert.equal(stockSizeFromFabric("44"), "44");
    assert.equal(boggiOvercoatPatternRef("46"), "Boggi Overcoat 46");
    assert.equal(BOGGI_OVERCOAT_SPEC_FILENAME, "Boggi Measurement Spec for Overcoat.xlsx");
  });
});

describe("buildBasePointsFromSizeRun", () => {
  it("keeps the linked filled sheet when a size was drafted twice", () => {
    const loose = sheet("46", 10);
    const linked = sheet("46", 22.25, { id: "cp-46-best", linked_fabric_line_ids: ["line-1"] });
    assert.equal(pickBestSizeRunSheet([loose, linked], "46")?.id, "cp-46-best");
    const points = buildBasePointsFromSizeRun([loose, linked, sheet("44", 21.5)], ["44", "46"]);
    assert.equal(points[0]?.name, "1/2 Chest Width");
    assert.equal(points[0]?.values["44"], 21.5);
    assert.equal(points[0]?.values["46"], 22.25);
  });
});
