import assert from "node:assert/strict";
import { test } from "node:test";
import {
  baseColumnValue,
  buildSampleFillFromBase,
  convertUnitValue,
  matchSheetPointsToBase,
  normalizePointKey,
  summarizeSampleFill,
} from "@/lib/pattern-library/load-from-base";
import type { TrialSheetPoint } from "@/lib/pattern-library/trial-sheet";
import type {
  BasePatternClientColumn,
  BasePatternPoint,
  MeasurementPointDef,
} from "@/lib/types/pattern-library";

function point(
  pointId: string,
  name: string,
  values: Record<string, number | null>,
  isGraded = true
): BasePatternPoint {
  return {
    point_id: pointId,
    name,
    remark: null,
    is_graded: isGraded,
    tolerance: null,
    grading_increment: null,
    diagram_code: null,
    values,
  };
}

function row(pointId: string, name: string): TrialSheetPoint {
  return { point_id: pointId, name, remark: null };
}

// ---------------------------------------------------------------- conversion

test("same unit copies the value untouched", () => {
  assert.equal(convertUnitValue(56.25, "cm", "cm"), 56.25);
  assert.equal(convertUnitValue(22.1875, "in", "in"), 22.1875);
});

test("cm -> in converts and snaps to the sheet's 1/16 inch precision", () => {
  // 56 cm = 22.047... in -> 22 1/16 (22.0625)
  assert.equal(convertUnitValue(56, "cm", "in"), 22.0625);
  // 2.54 cm = exactly 1 in
  assert.equal(convertUnitValue(2.54, "cm", "in"), 1);
  // 100 cm = 39.37 in -> 39 3/8 (39.375)
  assert.equal(convertUnitValue(100, "cm", "in"), 39.375);
});

test("in -> cm converts with 2-decimal rounding (cm sheet precision)", () => {
  assert.equal(convertUnitValue(22, "in", "cm"), 55.88);
  assert.equal(convertUnitValue(1, "in", "cm"), 2.54);
  // 5 5/8 in = 14.2875 cm -> 14.29
  assert.equal(convertUnitValue(5.625, "in", "cm"), 14.29);
});

// ------------------------------------------------------------ name matching

test("normalizePointKey is case/spacing/punctuation-insensitive", () => {
  assert.equal(normalizePointKey("1/2 Waist"), "1 2 waist");
  assert.equal(normalizePointKey(" 1/2  WAIST "), "1 2 waist");
  assert.equal(normalizePointKey("1/2 Hip (19cm below w/b)"), "1 2 hip 19cm below w b");
});

test("matches by point_id first, then by normalized name", () => {
  const rows = [row("1-2-waist", "1/2 Waist"), row("custom-hem", "1/2 Hem Width")];
  const points = [
    point("1-2-waist", "Renamed on base", { M: 40 }),
    point("bp-hem", "1/2 HEM width", { M: 25 }),
  ];
  const matched = matchSheetPointsToBase(rows, points, []);
  assert.equal(matched.get("1-2-waist")?.point_id, "1-2-waist");
  assert.equal(matched.get("custom-hem")?.point_id, "bp-hem");
});

test("matches through dictionary aliases in both directions", () => {
  const dictionary: MeasurementPointDef[] = [
    {
      id: "1-2-hem-width",
      name: "1/2 Hem Width",
      aliases: ["1/2 Bottom Width"],
      garment_types: ["trouser"],
    },
  ];
  const rows = [row("1-2-hem-width", "1/2 Hem Width")];
  const points = [point("bp-bottom", "1/2 Bottom Width", { M: 24 })];
  const matched = matchSheetPointsToBase(rows, points, dictionary);
  assert.equal(matched.get("1-2-hem-width")?.point_id, "bp-bottom");
});

test("containment matches a unique longer base name", () => {
  const rows = [row("1-2-waist", "1/2 Waist")];
  const points = [
    point("bp-waist-relux", "1/2 Waist straight Relux", { M: 44 }),
    point("bp-hip", "1/2 Hip (19cm below w/b)", { M: 52 }),
  ];
  const matched = matchSheetPointsToBase(rows, points, []);
  assert.equal(matched.get("1-2-waist")?.point_id, "bp-waist-relux");
});

test("containment does not cross word boundaries (waist vs waistband)", () => {
  const rows = [row("1-2-waist", "1/2 Waist")];
  const points = [point("bp-waistband", "1/2 Waistband", { M: 4 })];
  const matched = matchSheetPointsToBase(rows, points, []);
  assert.equal(matched.has("1-2-waist"), false);
});

test("ambiguous containment leaves the row unmatched", () => {
  const rows = [row("1-2-waist", "1/2 Waist")];
  const points = [
    point("bp-waist-relax", "1/2 Waist relax", { M: 44 }),
    point("bp-waist-stretch", "1/2 Waist stretched", { M: 48 }),
  ];
  const matched = matchSheetPointsToBase(rows, points, []);
  assert.equal(matched.has("1-2-waist"), false);
});

test("a base point is claimed at most once", () => {
  const rows = [row("a", "1/2 Waist straight Relux"), row("b", "1/2 Waist")];
  const points = [point("bp-waist", "1/2 Waist straight Relux", { M: 44 })];
  const matched = matchSheetPointsToBase(rows, points, []);
  assert.equal(matched.get("a")?.point_id, "bp-waist");
  assert.equal(matched.has("b"), false);
});

// ------------------------------------------------------------- column value

test("client fit column value falls back to the anchor size when not entered", () => {
  const p = point("bp-waist", "1/2 Waist", { M: 44, L: 46 });
  const column: BasePatternClientColumn = {
    id: "bpcc-1",
    client_id: "client-1",
    client_code: "FR",
    client_name: "Client",
    base_size: "L",
    values: { "bp-waist": null },
    created_by: null,
    updated_by: null,
    created_at: "",
    updated_at: "",
  };
  assert.equal(baseColumnValue(p, { kind: "client", column }), 46);
  column.values["bp-waist"] = 47.5;
  assert.equal(baseColumnValue(p, { kind: "client", column }), 47.5);
});

test("trim points (is_graded=false) fall back to the first documented value", () => {
  const p = point("bp-band", "Waist band height", { S: 4, M: null }, false);
  assert.equal(baseColumnValue(p, { kind: "size", size: "M" }), 4);
});

// ------------------------------------------------------------ full fill run

test("buildSampleFillFromBase converts cm grid to inch sheet and reports unmatched", () => {
  const rows = [
    row("1-2-waist", "1/2 Waist"),
    row("1-2-hip-19", "1/2 Hip (19cm below w/b)"),
    row("inseam", "Inseam"),
  ];
  const base = {
    unit: "cm" as const,
    points: [
      point("bp-waist", "1/2 Waist straight Relux", { M: 44 }),
      point("bp-hip", "1/2 hip (19cm below W/B)", { M: 55.88 }),
    ],
  };
  const result = buildSampleFillFromBase({
    rows,
    base,
    column: { kind: "size", size: "M" },
    sheetUnit: "in",
    dictionary: [],
  });
  // 44 cm = 17.322... -> 17 5/16 (17.3125); 55.88 cm = 22 in exactly.
  assert.equal(result.values["1-2-waist"], 17.3125);
  assert.equal(result.values["1-2-hip-19"], 22);
  assert.equal(result.converted, true);
  assert.deepEqual(result.unmatched, ["Inseam"]);
  assert.equal(
    summarizeSampleFill(result, rows.length),
    "2 of 3 points filled; unmatched: Inseam"
  );
});

test("rows matched to a column with no value are reported unmatched", () => {
  const rows = [row("1-2-waist", "1/2 Waist")];
  const base = {
    unit: "in" as const,
    points: [point("1-2-waist", "1/2 Waist", { M: null })],
  };
  const result = buildSampleFillFromBase({
    rows,
    base,
    column: { kind: "size", size: "M" },
    sheetUnit: "in",
    dictionary: [],
  });
  assert.equal(result.filled.length, 0);
  assert.deepEqual(result.unmatched, ["1/2 Waist"]);
  assert.equal(result.converted, false);
});
