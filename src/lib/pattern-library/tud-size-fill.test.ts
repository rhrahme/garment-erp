import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTudFillSuggestion,
  fillMeasurementsFromBase,
  findBaseSizeMatch,
  matchTudSizesToBase,
  normalizeSizeToken,
  sizesMatch,
} from "./tud-size-fill.ts";
import type {
  BasePattern,
  ClientPattern,
  ClientPatternMeasurement,
  PatternLibraryAttachment,
} from "@/lib/types/pattern-library";

// --- size normalization -----------------------------------------------------

test("normalizeSizeToken canonicalizes repeated-X alpha sizes to numeric form", () => {
  assert.equal(normalizeSizeToken("XXL"), "2XL");
  assert.equal(normalizeSizeToken("XXXL"), "3XL");
  assert.equal(normalizeSizeToken("XXS"), "2XS");
  assert.equal(normalizeSizeToken("2XL"), "2XL");
  assert.equal(normalizeSizeToken("XL"), "XL");
  assert.equal(normalizeSizeToken("XS"), "XS");
});

test("normalizeSizeToken is case/dash/space tolerant", () => {
  assert.equal(normalizeSizeToken(" xxl "), "2XL");
  assert.equal(normalizeSizeToken("2-XL"), "2XL");
  assert.equal(normalizeSizeToken("2 xl"), "2XL");
  assert.equal(normalizeSizeToken("r-40"), "R40");
  assert.equal(normalizeSizeToken("R 40"), "R40");
});

test("sizesMatch equates 2XL/XXL but keeps prefixed sizes exact", () => {
  assert.ok(sizesMatch("2XL", "XXL"));
  assert.ok(sizesMatch("xxl", "2-XL"));
  assert.ok(sizesMatch("3XL", "XXXL"));
  assert.ok(sizesMatch("R-40", "R 40"));
  assert.ok(!sizesMatch("R-40", "40"));
  assert.ok(!sizesMatch("R-40", "L-40"));
  assert.ok(!sizesMatch("XL", "L"));
  assert.ok(!sizesMatch("XS", "S"));
  assert.ok(!sizesMatch("", ""));
});

test("findBaseSizeMatch returns the base's own spelling", () => {
  assert.equal(findBaseSizeMatch("2XL", ["S", "M", "L", "XL", "XXL"]), "XXL");
  assert.equal(findBaseSizeMatch("XXL", ["2XL"]), "2XL");
  assert.equal(findBaseSizeMatch("R-40", ["R-38", "R-40", "R-42"]), "R-40");
  assert.equal(findBaseSizeMatch("M", ["R-38", "R-40"]), null);
});

test("matchTudSizesToBase preserves order and dedupes equivalent sizes", () => {
  const matches = matchTudSizesToBase(["2XL", "XXL", "M", "R-40"], ["M", "XXL"]);
  assert.deepEqual(matches, [
    { size: "2XL", base_size: "XXL" },
    { size: "M", base_size: "M" },
  ]);
});

// --- sheet fill ---------------------------------------------------------------

function row(overrides: Partial<ClientPatternMeasurement>): ClientPatternMeasurement {
  return {
    point_id: "p",
    name: "Point",
    remark: null,
    is_graded: true,
    base_value: null,
    target_value: null,
    sewn_value: null,
    adjustment: null,
    remarks: null,
    ...overrides,
  };
}

const BASE: Pick<BasePattern, "points"> = {
  points: [
    {
      point_id: "half-chest",
      name: "1/2 Chest",
      remark: null,
      is_graded: true,
      tolerance: null,
      grading_increment: null,
      diagram_code: null,
      values: { XL: 24, XXL: 25.5 },
    },
    {
      point_id: "collar-height",
      name: "Collar Height",
      remark: null,
      is_graded: false,
      tolerance: null,
      grading_increment: null,
      diagram_code: null,
      // Trim point: value documented on one size only, constant across sizes.
      values: { XL: 1.5, XXL: null },
    },
    {
      point_id: "sleeve-length",
      name: "Sleeve Length",
      remark: null,
      is_graded: true,
      tolerance: null,
      grading_increment: null,
      diagram_code: null,
      values: { XL: 25, XXL: null },
    },
  ],
};

test("fillMeasurementsFromBase fills only empty base/target cells", () => {
  const rows = [
    row({ point_id: "half-chest", name: "1/2 Chest" }),
    // Entered values must survive untouched.
    row({ point_id: "sleeve-length", name: "Sleeve Length", base_value: 26, target_value: 26.5 }),
  ];
  const outcome = fillMeasurementsFromBase(rows, BASE, "XXL");
  const chest = outcome.measurements.find((r) => r.point_id === "half-chest")!;
  assert.equal(chest.base_value, 25.5);
  assert.equal(chest.target_value, 25.5);
  const sleeve = outcome.measurements.find((r) => r.point_id === "sleeve-length")!;
  assert.equal(sleeve.base_value, 26);
  assert.equal(sleeve.target_value, 26.5);
  assert.equal(outcome.filled_points, 1);
  // collar-height missing from the sheet — appended with the trim fallback.
  const collar = outcome.measurements.find((r) => r.point_id === "collar-height")!;
  assert.equal(collar.base_value, 1.5);
  assert.equal(collar.is_graded, false);
  assert.equal(outcome.added_points, 1);
});

test("fillMeasurementsFromBase fills a partially-entered row's empty cell only", () => {
  const rows = [row({ point_id: "half-chest", name: "1/2 Chest", target_value: 26 })];
  const outcome = fillMeasurementsFromBase(rows, BASE, "XXL");
  const chest = outcome.measurements[0]!;
  assert.equal(chest.base_value, 25.5); // empty base cell filled
  assert.equal(chest.target_value, 26); // entered target preserved
  assert.equal(outcome.filled_points, 1);
});

test("fillMeasurementsFromBase matches template rows by name when point ids differ", () => {
  const rows = [row({ point_id: "dict-half-chest", name: "1/2 CHEST" })];
  const outcome = fillMeasurementsFromBase(rows, BASE, "XXL");
  const chest = outcome.measurements.find((r) => r.point_id === "dict-half-chest")!;
  assert.equal(chest.base_value, 25.5);
  // Matched by name — the base point must not be appended as a duplicate.
  assert.ok(!outcome.measurements.some((r) => r.point_id === "half-chest"));
});

test("fillMeasurementsFromBase leaves cells empty when the base has no value at that size", () => {
  const rows = [row({ point_id: "sleeve-length", name: "Sleeve Length" })];
  const outcome = fillMeasurementsFromBase(rows, BASE, "XXL"); // sleeve XXL is null, graded
  assert.equal(outcome.measurements[0]!.base_value, null);
  assert.equal(outcome.filled_points, 0);
});

// --- upload suggestion --------------------------------------------------------

function makeBase(overrides: Partial<BasePattern>): BasePattern {
  return {
    id: "bp-1",
    house_brand_id: "fouad-rahme",
    house_brand_code: "FR",
    cut_family: "Suit Supply",
    garment_type: "shirt",
    cut_variant: "Regular",
    name: "Suit Supply Shirt Regular",
    unit: "in",
    sizes: ["XL", "XXL"],
    points: BASE.points,
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
    ...overrides,
  };
}

function makePattern(overrides: Partial<ClientPattern>): ClientPattern {
  return {
    id: "cp-1",
    pattern_ref: "SS-SHIRT-FR-REG",
    client_id: "client-1",
    client_code: "AJ",
    client_name: "Ajlan",
    garment_type: "shirt",
    description: null,
    base_pattern_id: null,
    base_size: null,
    house_brand_id: null,
    house_brand_code: null,
    fabric: null,
    unit: "in",
    versions: [
      {
        id: "cpv-1",
        version: 1,
        is_final: false,
        trial_date: null,
        measurements: [row({ point_id: "half-chest", name: "1/2 Chest" })],
        special_instructions: null,
        notes: null,
        files: [],
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    final_version_id: null,
    special_instructions: null,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    files: [],
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeAttachment(sizes: string[]): PatternLibraryAttachment {
  return {
    id: "plf-1",
    kind: "tud",
    filename: "style.tud",
    stored_filename: "cp-1-style.tud",
    content_type: "application/octet-stream",
    size_bytes: 1,
    uploaded_at: "2026-01-01T00:00:00.000Z",
    uploaded_by: null,
    tud: {
      style_caption: "Sample Style",
      source_path: null,
      sizes,
      pieces: [],
      total_cut_pieces: null,
      fabric_totals: [],
      size_totals: [],
      total_area_m2: null,
      total_perimeter_cm: null,
    },
  };
}

test("buildTudFillSuggestion matches the linked base and previews the fill", () => {
  const base = makeBase({});
  const pattern = makePattern({ base_pattern_id: base.id, house_brand_code: "FR" });
  const suggestion = buildTudFillSuggestion({
    pattern,
    basePatterns: [base],
    attachment: makeAttachment(["2XL"]),
  });
  assert.ok(suggestion);
  assert.deepEqual(suggestion.base?.matches, [{ size: "2XL", base_size: "XXL" }]);
  assert.equal(suggestion.version_id, "cpv-1");
  assert.equal(suggestion.fillable_points, 1);
  assert.equal(suggestion.addable_points, 2);
  assert.deepEqual(suggestion.candidate_bases, []);
});

test("buildTudFillSuggestion offers same-garment candidate bases when none is linked", () => {
  const shirt = makeBase({ id: "bp-shirt" });
  const jacket = makeBase({ id: "bp-jacket", garment_type: "jacket" });
  const noOverlap = makeBase({ id: "bp-small", sizes: ["S", "M"] });
  const suggestion = buildTudFillSuggestion({
    pattern: makePattern({}),
    basePatterns: [shirt, jacket, noOverlap],
    attachment: makeAttachment(["XXL"]),
  });
  assert.ok(suggestion);
  assert.equal(suggestion.base, null);
  assert.deepEqual(
    suggestion.candidate_bases.map((candidate) => candidate.id),
    ["bp-shirt"]
  );
});

test("buildTudFillSuggestion is null when nothing is actionable", () => {
  const base = makeBase({});
  // No sizes in the file.
  assert.equal(
    buildTudFillSuggestion({
      pattern: makePattern({ base_pattern_id: base.id }),
      basePatterns: [base],
      attachment: makeAttachment([]),
    }),
    null
  );
  // No size overlap with the linked base.
  assert.equal(
    buildTudFillSuggestion({
      pattern: makePattern({ base_pattern_id: base.id }),
      basePatterns: [base],
      attachment: makeAttachment(["R-40"]),
    }),
    null
  );
  // No base linked and no candidate base matches.
  assert.equal(
    buildTudFillSuggestion({
      pattern: makePattern({}),
      basePatterns: [makeBase({ garment_type: "jacket" })],
      attachment: makeAttachment(["XXL"]),
    }),
    null
  );
});

test("buildTudFillSuggestion is null when already sized and the sheet is full", () => {
  const base = makeBase({});
  const pattern = makePattern({ base_pattern_id: base.id, base_size: "XXL" });
  // Fill every base point with entered values so nothing is fillable/addable.
  pattern.versions[0]!.measurements = BASE.points.map((point) =>
    row({ point_id: point.point_id, name: point.name, base_value: 1, target_value: 1 })
  );
  assert.equal(
    buildTudFillSuggestion({
      pattern,
      basePatterns: [base],
      attachment: makeAttachment(["2XL"]),
    }),
    null
  );
});
