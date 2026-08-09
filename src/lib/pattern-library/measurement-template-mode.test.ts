import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMeasurementsFromTemplate } from "@/lib/pattern-library/mutations";
import {
  REDUCED_TROUSER_POINTS,
  buildReducedMeasurementsFromTemplate,
  defaultMeasurementTemplateMode,
  garmentOffersReducedMeasurementTemplate,
  mergeTemplateMeasurements,
  parseMeasurementTemplateMode,
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
  assert.equal(garmentOffersReducedMeasurementTemplate("jacket"), false);
  assert.equal(defaultMeasurementTemplateMode("trouser"), "reduced");
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

test("buildMeasurementsFromTemplate respects entire vs reduced", () => {
  const entire = buildMeasurementsFromTemplate(dictionary, "trouser", "entire");
  assert.equal(entire.length, 3);
  assert.ok(entire.some((point) => point.point_id === "loops-width-6-pcs"));

  const reduced = buildMeasurementsFromTemplate(dictionary, "trouser", "reduced");
  assert.equal(reduced.length, 17);
  assert.ok(!reduced.some((point) => point.point_id === "loops-width-6-pcs"));
  assert.ok(reduced.some((point) => point.point_id === "front-rise"));
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
