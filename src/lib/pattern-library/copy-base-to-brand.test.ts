import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCopiedBaseInput,
  findMatchingBaseOnBrand,
  rewriteBrandLabel,
  rewritePointForBrand,
  rewriteSizeList,
  sameHouseCut,
} from "@/lib/pattern-library/copy-base-to-brand";
import type { BasePattern } from "@/lib/types/pattern-library";

function base(partial: Partial<BasePattern> = {}): BasePattern {
  return {
    id: "bp-gl-beirut-jacket",
    house_brand_id: "gliani",
    house_brand_code: "GL",
    cut_family: "Beirut",
    garment_type: "jacket",
    cut_variant: null,
    name: "Beirut Jacket",
    unit: "cm",
    sizes: ["GL-44", "GL-46"],
    points: [
      {
        point_id: "chest",
        name: "Chest",
        remark: null,
        is_graded: true,
        tolerance: null,
        grading_increment: null,
        diagram_code: null,
        values: { "GL-44": 108, "GL-46": 112 },
      },
    ],
    style_code: "GL-JKT",
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

describe("rewriteBrandLabel", () => {
  it("rewrites a size prefix and a file name, not a random GL in a word", () => {
    assert.equal(rewriteBrandLabel("GL-44", "GL", "FR"), "FR-44");
    assert.equal(rewriteBrandLabel("GL_shirt.dxf", "GL", "FR"), "FR_shirt.dxf");
    assert.equal(rewriteBrandLabel("SINGLE", "GL", "FR"), "SINGLE");
  });
});

describe("rewriteSizeList and points", () => {
  it("moves GL size keys onto FR", () => {
    assert.deepEqual(rewriteSizeList(["GL-44", "46"], "GL", "FR"), ["FR-44", "46"]);
    const point = rewritePointForBrand(base().points[0]!, "GL", "FR");
    assert.deepEqual(point.values, { "FR-44": 108, "FR-46": 112 });
  });
});

describe("buildCopiedBaseInput", () => {
  it("keeps the cut and rewrites brand tokens", () => {
    const input = buildCopiedBaseInput(base(), {
      house_brand_id: "fouad-rahme",
      house_brand_code: "FR",
    });
    assert.equal(input.house_brand_id, "fouad-rahme");
    assert.equal(input.house_brand_code, "FR");
    assert.equal(input.cut_family, "Beirut");
    assert.equal(input.garment_type, "jacket");
    assert.deepEqual(input.sizes, ["FR-44", "FR-46"]);
    assert.equal(input.style_code, "FR-JKT");
  });
});

describe("findMatchingBaseOnBrand", () => {
  it("matches the same garment cut on the target brand", () => {
    const gl = base();
    const fr = base({
      id: "bp-fr-beirut-jacket",
      house_brand_id: "fouad-rahme",
      house_brand_code: "FR",
      sizes: ["44", "46"],
    });
    const other = base({
      id: "bp-fr-beirut-trouser",
      house_brand_id: "fouad-rahme",
      house_brand_code: "FR",
      garment_type: "trouser",
      name: "Beirut Trouser",
    });
    assert.equal(sameHouseCut(gl, fr), true);
    assert.equal(findMatchingBaseOnBrand([fr, other], gl, "fouad-rahme")?.id, fr.id);
    assert.equal(findMatchingBaseOnBrand([other], gl, "fouad-rahme"), null);
  });
});
