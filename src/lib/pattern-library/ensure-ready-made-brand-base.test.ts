import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOGGI_OVERCOAT_POINT_NAMES,
  BOGGI_OVERCOAT_SIZES,
  findBrandFamilyGarment,
  sameBrandFamilyGarment,
} from "@/lib/pattern-library/ensure-ready-made-brand-base";
import type { BasePattern } from "@/lib/types/pattern-library";

function base(partial: Partial<BasePattern> = {}): BasePattern {
  return {
    id: "bp-fr-boggi-jacket",
    house_brand_id: "fouad-rahme",
    house_brand_code: "FR",
    cut_family: "Boggi",
    garment_type: "jacket",
    cut_variant: null,
    name: "Boggi Jacket",
    unit: "in",
    sizes: ["48", "50"],
    points: [],
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
    ...partial,
  };
}

describe("Boggi Overcoat size run", () => {
  it("keeps Stock-44..68 as even size numbers on one sheet", () => {
    assert.deepEqual([...BOGGI_OVERCOAT_SIZES], [
      "44",
      "46",
      "48",
      "50",
      "52",
      "54",
      "56",
      "58",
      "60",
      "62",
      "64",
      "66",
      "68",
    ]);
    assert.ok(BOGGI_OVERCOAT_POINT_NAMES.includes("1/2 Chest"));
  });
});

describe("findBrandFamilyGarment", () => {
  it("matches Boggi overcoat on the same house brand only", () => {
    const frJacket = base();
    const frOvercoat = base({
      id: "bp-fr-boggi-overcoat",
      garment_type: "overcoat",
      name: "Boggi Overcoat",
    });
    const glOvercoat = base({
      id: "bp-gl-boggi-overcoat",
      house_brand_id: "gliani",
      house_brand_code: "GL",
      garment_type: "overcoat",
      name: "Boggi Overcoat",
    });
    const list = [frJacket, frOvercoat, glOvercoat];
    assert.equal(
      findBrandFamilyGarment(list, {
        house_brand_id: "fouad-rahme",
        cut_family: "Boggi",
        garment_type: "overcoat",
      })?.id,
      "bp-fr-boggi-overcoat"
    );
    assert.equal(
      findBrandFamilyGarment(list, {
        house_brand_id: "gliani",
        cut_family: "boggi",
        garment_type: "Overcoat",
      })?.id,
      "bp-gl-boggi-overcoat"
    );
    assert.equal(
      sameBrandFamilyGarment(frJacket, {
        house_brand_id: "fouad-rahme",
        cut_family: "Boggi",
        garment_type: "overcoat",
      }),
      false
    );
  });
});
