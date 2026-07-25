import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BasePattern } from "@/lib/types/pattern-library";
import {
  cascadeSelectionReady,
  emptyCascadeValue,
  filterBases,
  garmentMatchesLibraryBase,
  PATTERN_SHEET_GARMENTS,
  preferredBrandCodeFromClientCode,
  sheetsMissingLibraryBases,
  uniqueBrandCodes,
  uniqueGarmentTypes,
  withAutoResolvedBase,
} from "./base-pattern-picker.ts";

function makeBase(partial: Partial<BasePattern> & Pick<BasePattern, "id">): BasePattern {
  return {
    house_brand_id: "fouad-rahme",
    house_brand_code: "FR",
    cut_family: "Suit Supply",
    garment_type: "shirt",
    cut_variant: "Regular",
    name: "Test",
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

describe("base-pattern-picker", () => {
  const bases = [
    makeBase({ id: "bp-fr-ss-shirt-reg", cut_variant: "Regular" }),
    makeBase({ id: "bp-fr-ss-shirt-long", cut_variant: "Long" }),
    makeBase({
      id: "bp-fr-ss-jacket",
      garment_type: "jacket",
      cut_variant: "Regular",
      name: "SS Jacket",
    }),
    makeBase({
      id: "bp-gl-ss-shirt",
      house_brand_id: "gliani",
      house_brand_code: "GL",
      cut_variant: "Regular",
    }),
    makeBase({
      id: "bp-fr-massimo-shorts",
      cut_family: "Massimo",
      garment_type: "shorts",
      cut_variant: null,
      sizes: ["S", "M", "L", "XL"],
    }),
  ];

  it("preferredBrandCodeFromClientCode reads FR/GL prefix", () => {
    assert.equal(preferredBrandCodeFromClientCode("FR-0626-0035"), "FR");
    assert.equal(preferredBrandCodeFromClientCode("GL-0726-0001"), "GL");
    assert.equal(preferredBrandCodeFromClientCode("bad"), null);
  });

  it("filterBases narrows by brand then garment", () => {
    const shirts = filterBases(bases, { garmentType: "shirt" });
    assert.equal(shirts.length, 3);
    const frShirts = filterBases(shirts, { houseBrandCode: "FR" });
    assert.equal(frShirts.length, 2);
    assert.ok(frShirts.every((base) => base.house_brand_code === "FR"));
    assert.ok(frShirts.every((base) => base.garment_type === "shirt"));
  });

  it("uniqueGarmentTypes starts from the sales stitch list", () => {
    const garments = uniqueGarmentTypes(bases);
    assert.ok(garments.includes("Shirt LS"));
    assert.ok(garments.includes("Polo"));
    assert.ok(garments.includes("Trouser"));
    assert.ok(garments.includes("Short"));
    assert.ok(!garments.includes("Fabric only"));
    assert.equal(garments[0], PATTERN_SHEET_GARMENTS[0]);
    assert.deepEqual(uniqueBrandCodes(filterBases(bases, { garmentType: "shirt" })), ["FR", "GL"]);
  });

  it("Shirt LS / Short map to library shirt / shorts bases", () => {
    assert.equal(garmentMatchesLibraryBase("Shirt LS", "shirt"), true);
    assert.equal(garmentMatchesLibraryBase("Short", "shorts"), true);
    assert.equal(garmentMatchesLibraryBase("Polo", "shirt"), true);
    assert.equal(filterBases(bases, { garmentType: "Shirt LS" }).length, 3);
    assert.equal(filterBases(bases, { garmentType: "Short" }).length, 1);
  });

  it("Custom path is ready without a base id", () => {
    const custom = { ...emptyCascadeValue("FR"), garmentType: "shirt", origin: "custom" as const };
    assert.equal(cascadeSelectionReady(custom), true);
    assert.equal(custom.basePatternId, "");
  });

  it("withAutoResolvedBase picks the only matching base + size", () => {
    const resolved = withAutoResolvedBase(bases, {
      garmentType: "shorts",
      origin: "library",
      houseBrandCode: "FR",
      cutFamily: "Massimo",
      cutVariant: "",
      basePatternId: "",
      baseSize: "",
    });
    assert.equal(resolved.basePatternId, "bp-fr-massimo-shorts");
    assert.equal(resolved.baseSize, "S");
  });

  it("sheetsMissingLibraryBases lists stitch types with no bases", () => {
    const missing = sheetsMissingLibraryBases(bases);
    assert.ok(missing.includes("Polo"));
    assert.ok(missing.includes("Vest"));
    assert.ok(!missing.includes("Short")); // shorts base exists
  });

  it("library path is not ready until base + size set", () => {
    const incomplete = {
      garmentType: "shirt",
      origin: "library" as const,
      houseBrandCode: "FR",
      cutFamily: "Suit Supply",
      cutVariant: "",
      basePatternId: "",
      baseSize: "",
    };
    assert.equal(cascadeSelectionReady(incomplete), false);
    const complete = withAutoResolvedBase(bases, {
      ...incomplete,
      cutVariant: "Regular",
    });
    assert.equal(complete.basePatternId, "bp-fr-ss-shirt-reg");
    assert.equal(cascadeSelectionReady(complete), true);
  });
});
