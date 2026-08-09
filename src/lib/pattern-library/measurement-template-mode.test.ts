import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMeasurementsFromTemplate } from "@/lib/pattern-library/mutations";
import {
  REDUCED_TROUSER_POINTS,
  buildReducedMeasurementsFromTemplate,
  defaultMeasurementTemplateMode,
  garmentOffersReducedMeasurementTemplate,
  filterTrialSheetPointsForPiece,
  garmentIsMeasurementSet,
  groupTrialSheetPointsByPiece,
  mergeTemplateMeasurements,
  parseMeasurementTemplateMode,
  reducedPointSpecsForGarment,
} from "@/lib/pattern-library/measurement-template-mode";
import type {
  ClientPatternMeasurement,
  MeasurementPointDef,
} from "@/lib/types/pattern-library";

const dictionary: MeasurementPointDef[] = [
  {
    id: "1-2-hip",
    name: "1/2 Hip",
    aliases: [],
    garment_types: ["trouser", "shorts"],
  },
  {
    id: "front-rise",
    name: "Front Rise",
    aliases: [],
    garment_types: ["trouser"],
  },
  {
    id: "loops-width-6-pcs",
    name: "Loops width (6 pcs)",
    aliases: [],
    garment_types: ["trouser"],
  },
  {
    id: "1-2-chest",
    name: "1/2 Chest",
    aliases: [],
    garment_types: ["overshirt", "shirt"],
  },
  {
    id: "slv-length",
    name: "Slv Length",
    aliases: [],
    garment_types: ["overshirt"],
  },
  {
    id: "1-2-hem-width",
    name: "1/2 Hem Width",
    aliases: [],
    garment_types: ["overshirt", "trouser"],
  },
  {
    id: "bottom-width",
    name: "Bottom width",
    aliases: [],
    garment_types: ["trouser"],
  },
  {
    id: "chest",
    name: "Chest",
    aliases: [],
    garment_types: ["jacket"],
  },
];

function row(
  pointId: string,
  name: string,
  values: Partial<
    Pick<ClientPatternMeasurement, "base_value" | "target_value" | "remarks">
  > = {}
): ClientPatternMeasurement {
  return {
    point_id: pointId,
    name,
    remark: null,
    is_graded: true,
    base_value: values.base_value ?? null,
    target_value: values.target_value ?? null,
    sewn_value: null,
    adjustment: null,
    remarks: values.remarks ?? null,
  };
}

test("trousers offer reduced template and default to reduced", () => {
  assert.equal(garmentOffersReducedMeasurementTemplate("Trouser"), true);
  assert.equal(garmentOffersReducedMeasurementTemplate("pants"), true);
  assert.equal(garmentOffersReducedMeasurementTemplate("Overshirt+Trouser"), true);
  assert.equal(garmentOffersReducedMeasurementTemplate("jacket"), false);
  assert.equal(defaultMeasurementTemplateMode("trouser"), "reduced");
  assert.equal(defaultMeasurementTemplateMode("Overshirt+Trouser"), "reduced");
  assert.equal(defaultMeasurementTemplateMode("shirt"), "entire");
});

test("parseMeasurementTemplateMode accepts entire/reduced only", () => {
  assert.equal(parseMeasurementTemplateMode("reduced"), "reduced");
  assert.equal(parseMeasurementTemplateMode("entire"), "entire");
  assert.equal(parseMeasurementTemplateMode("full"), null);
});

test("reduced trouser list is the 17 Pattern stitcher points in order", () => {
  assert.equal(REDUCED_TROUSER_POINTS.length, 17);
  assert.equal(REDUCED_TROUSER_POINTS[0]?.name, "1/2 Waist Relax");
  assert.equal(REDUCED_TROUSER_POINTS[16]?.name, "Front Hem");
  const built = buildReducedMeasurementsFromTemplate(dictionary, "trouser");
  assert.equal(built.length, 17);
  assert.equal(built[0]?.point_id, "1-2-waist-relux");
  assert.equal(built[0]?.name, "1/2 Waist Relax");
  assert.equal(built[3]?.name, "Front Rise");
});

test("Overshirt+Trouser reduced includes overshirt points then trouser set", () => {
  const specs = reducedPointSpecsForGarment(dictionary, "Overshirt+Trouser");
  assert.ok(specs.some((s) => s.point_id === "1-2-chest"));
  assert.ok(specs.some((s) => s.point_id === "slv-length"));
  assert.ok(specs.some((s) => s.point_id === "front-rise"));
  assert.ok(!specs.some((s) => s.point_id === "loops-width-6-pcs"));
  // Overshirt section first
  assert.equal(specs[0]?.point_id, "1-2-chest");
  // Overshirt keeps hem; trouser bottom uses a separate id (not shared hem).
  assert.equal(specs.filter((s) => s.point_id === "1-2-hem-width").length, 1);
  assert.ok(specs.some((s) => s.point_id === "bottom-width"));

  const built = buildReducedMeasurementsFromTemplate(dictionary, "Overshirt+Trouser");
  assert.ok(built.length > 17);
  assert.ok(built.some((row) => row.name === "1/2 Chest"));
  assert.ok(built.some((row) => row.name === "Front Rise"));
});

test("Suit and Suit+Vest reduced keep jacket (and vest) before trouser set", () => {
  const suit = reducedPointSpecsForGarment(dictionary, "Suit");
  assert.ok(suit.some((s) => s.point_id === "chest"));
  assert.ok(suit.some((s) => s.point_id === "front-rise"));
  assert.equal(suit[0]?.point_id, "chest");

  // Case-insensitive sheet garment
  const suitLower = reducedPointSpecsForGarment(dictionary, "suit");
  assert.ok(suitLower.some((s) => s.point_id === "chest"));

  const suitVest = reducedPointSpecsForGarment(dictionary, "Suit+Vest");
  // Must not collapse "suit" into trouser-only (bug: jacket dropped).
  assert.ok(suitVest.some((s) => s.point_id === "chest"));
  assert.ok(suitVest.some((s) => s.point_id === "front-rise"));
  assert.equal(suitVest[0]?.point_id, "chest");
});

test("Shirt+Trouser and Shirt+Trouser+Short include shirt (+ short) with trouser reduced", () => {
  const shirtTrouser = reducedPointSpecsForGarment(dictionary, "Shirt+Trouser");
  assert.ok(shirtTrouser.some((s) => s.point_id === "1-2-chest"));
  assert.ok(shirtTrouser.some((s) => s.point_id === "front-rise"));

  const withShort = reducedPointSpecsForGarment(dictionary, "Shirt+Trouser+Short");
  assert.ok(withShort.some((s) => s.point_id === "1-2-chest"));
  assert.ok(withShort.some((s) => s.point_id === "front-rise"));
});

test("Shirt+Short has no trouser piece so reduced template is not offered", () => {
  assert.equal(garmentOffersReducedMeasurementTemplate("Shirt+Short"), false);
  assert.equal(defaultMeasurementTemplateMode("Shirt+Short"), "entire");
  assert.equal(reducedPointSpecsForGarment(dictionary, "Shirt+Short").length, 0);
});

test("buildMeasurementsFromTemplate respects entire vs reduced", () => {
  const entire = buildMeasurementsFromTemplate(dictionary, "trouser", "entire");
  assert.equal(entire.length, 3);
  assert.ok(entire.some((point) => point.point_id === "loops-width-6-pcs"));

  const reduced = buildMeasurementsFromTemplate(dictionary, "trouser", "reduced");
  assert.equal(reduced.length, 17);
  assert.ok(!reduced.some((point) => point.point_id === "loops-width-6-pcs"));
  assert.ok(reduced.some((point) => point.point_id === "front-rise"));
});

test("set garments need piece select; filter shows one piece sheet", () => {
  assert.equal(garmentIsMeasurementSet("Overshirt+Trouser"), true);
  assert.equal(garmentIsMeasurementSet("Shirt+Short"), true);
  assert.equal(garmentIsMeasurementSet("Overshirt"), false);

  const points = [
    { point_id: "front-rise", name: "Front Rise" },
    { point_id: "1-2-chest", name: "1/2 Chest" },
    { point_id: "1-2-hem-width", name: "1/2 Hem Width" },
    { point_id: "slv-length", name: "Slv Length" },
    { point_id: "bottom-width", name: "1/2 Bottom width" },
  ];
  const overshirt = filterTrialSheetPointsForPiece(points, "Overshirt", dictionary);
  assert.deepEqual(
    overshirt.map((p) => p.point_id),
    ["1-2-chest", "1-2-hem-width", "slv-length"]
  );
  const trouser = filterTrialSheetPointsForPiece(points, "Trouser", dictionary);
  assert.ok(trouser.some((p) => p.point_id === "front-rise"));
  assert.ok(trouser.some((p) => p.point_id === "bottom-width"));
  assert.ok(!trouser.some((p) => p.point_id === "1-2-chest"));
  assert.ok(!overshirt.some((p) => p.point_id === "front-rise"));
  assert.deepEqual(filterTrialSheetPointsForPiece(points, "", dictionary), []);
});

test("Waist Relax never appears under Overshirt even if stuck on hem id", () => {
  const points = [
    { point_id: "1-2-hem-width", name: "Waist Relax" },
    { point_id: "1-2-chest", name: "1/2 Chest" },
    { point_id: "1-2-waist-relux", name: "1/2 Hip" },
  ];
  const overshirt = filterTrialSheetPointsForPiece(points, "Overshirt", dictionary);
  const trouser = filterTrialSheetPointsForPiece(points, "Trouser", dictionary);
  assert.deepEqual(
    overshirt.map((p) => p.name),
    ["1/2 Chest"]
  );
  assert.ok(trouser.some((p) => p.name === "Waist Relax"));
  assert.ok(trouser.some((p) => p.name === "1/2 Hip"));
  assert.ok(!overshirt.some((p) => /waist|hip|relax/i.test(p.name)));
});

test("groupTrialSheetPointsByPiece splits Overshirt+Trouser with Shared for dual tags", () => {
  const points = [
    { point_id: "front-rise", name: "Front Rise" },
    { point_id: "1-2-chest", name: "1/2 Chest" },
    { point_id: "1-2-hem-width", name: "1/2 Hem Width" },
    { point_id: "slv-length", name: "Slv Length" },
    { point_id: "custom-x", name: "Custom X" },
  ];
  const sections = groupTrialSheetPointsByPiece(
    points,
    "Overshirt+Trouser",
    dictionary
  );
  assert.deepEqual(
    sections.map((section) => section.label),
    ["Overshirt", "Trouser", "Shared", "Other"]
  );
  assert.deepEqual(
    sections.find((s) => s.label === "Overshirt")?.points.map((p) => p.point_id),
    ["1-2-chest", "slv-length"]
  );
  assert.deepEqual(
    sections.find((s) => s.label === "Trouser")?.points.map((p) => p.point_id),
    ["front-rise"]
  );
  assert.deepEqual(
    sections.find((s) => s.label === "Shared")?.points.map((p) => p.point_id),
    ["1-2-hem-width"]
  );
  assert.deepEqual(
    sections.find((s) => s.label === "Other")?.points.map((p) => p.point_id),
    ["custom-x"]
  );

  const flat = groupTrialSheetPointsByPiece(points, "Overshirt", dictionary);
  assert.equal(flat.length, 1);
  assert.equal(flat[0]?.label, null);
  assert.equal(flat[0]?.points.length, 5);

  const unloaded = groupTrialSheetPointsByPiece(points, "Overshirt+Trouser", []);
  assert.equal(unloaded.length, 1);
  assert.equal(unloaded[0]?.label, null);
});

test("mergeTemplateMeasurements keeps values and drops empty clutter on reduced", () => {
  const template = [
    row("front-rise", "Front Rise"),
    row("1-2-hip", "1/2 Hip"),
  ];
  const existing = [
    row("front-rise", "Front Rise", { base_value: 11.5 }),
    row("loops-width-6-pcs", "Loops width (6 pcs)"),
    row("custom-pocket", "Custom pocket", { remarks: "keep me" }),
  ];
  const reduced = mergeTemplateMeasurements(template, existing, "reduced");
  assert.equal(reduced.length, 3);
  assert.equal(reduced.find((r) => r.point_id === "front-rise")?.base_value, 11.5);
  assert.ok(reduced.some((r) => r.point_id === "custom-pocket"));
  assert.ok(!reduced.some((r) => r.point_id === "loops-width-6-pcs"));

  const entire = mergeTemplateMeasurements(template, existing, "entire");
  assert.ok(entire.some((r) => r.point_id === "loops-width-6-pcs"));
});
