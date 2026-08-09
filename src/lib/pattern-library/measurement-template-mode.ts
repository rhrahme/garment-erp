/**
 * Measurement sheet templates: entire dictionary vs a curated reduced list.
 * Trousers default to reduced - Pattern asked for the common stitcher set.
 */

import { libraryGarmentKeysForSheet } from "@/lib/pattern-library/base-pattern-picker";
import type {
  ClientPatternMeasurement,
  MeasurementPointDef,
} from "@/lib/types/pattern-library";

export type MeasurementTemplateMode = "entire" | "reduced";

/** Ordered reduced trouser points (Pattern floor sheet). */
export const REDUCED_TROUSER_POINTS: ReadonlyArray<{
  point_id: string;
  name: string;
}> = [
  { point_id: "1-2-waist-relux", name: "1/2 Waist Relax" },
  { point_id: "1-2-hip", name: "1/2 Hip" },
  { point_id: "side-pocket-opening-length", name: "Side pocket opening length" },
  { point_id: "front-rise", name: "Front Rise" },
  { point_id: "back-rise", name: "Back Rise" },
  { point_id: "1-2-thigh", name: "1/2 Thigh" },
  { point_id: "1-2-knee", name: "1/2 Knee" },
  { point_id: "1-2-hem-width", name: "1/2 Bottom width" },
  { point_id: "inseam-length", name: "Inseam Length" },
  {
    point_id: "outside-excluding-w-b",
    name: "Outseam Length (without Waistband)",
  },
  { point_id: "fly-length", name: "Fly Length" },
  { point_id: "waistband-height", name: "Waistband Height" },
  { point_id: "back-pocket-width", name: "Back Pocket width" },
  { point_id: "front-hip", name: "Front Hip" },
  { point_id: "front-thigh", name: "Front Thigh" },
  { point_id: "front-knee", name: "Front Knee" },
  { point_id: "front-hem", name: "Front Hem" },
];

export function parseMeasurementTemplateMode(
  value: unknown
): MeasurementTemplateMode | null {
  if (value === "entire" || value === "reduced") return value;
  return null;
}

export function garmentOffersReducedMeasurementTemplate(garmentType: string): boolean {
  const keys = libraryGarmentKeysForSheet(garmentType).map((key) => key.toLowerCase());
  keys.push(garmentType.trim().toLowerCase());
  return keys.some((key) => key === "trouser" || key === "trousers" || key === "pants");
}

/** Default when creating a sheet: reduced for trousers, entire otherwise. */
export function defaultMeasurementTemplateMode(
  garmentType: string
): MeasurementTemplateMode {
  return garmentOffersReducedMeasurementTemplate(garmentType) ? "reduced" : "entire";
}

export function reducedPointSpecsForGarment(
  garmentType: string
): ReadonlyArray<{ point_id: string; name: string }> {
  if (!garmentOffersReducedMeasurementTemplate(garmentType)) return [];
  return REDUCED_TROUSER_POINTS;
}

export function emptyMeasurementRow(
  pointId: string,
  name: string
): ClientPatternMeasurement {
  return {
    point_id: pointId,
    name,
    remark: null,
    is_graded: true,
    base_value: null,
    target_value: null,
    sewn_value: null,
    adjustment: null,
    remarks: null,
  };
}

export function measurementRowHasEnteredValue(
  row: ClientPatternMeasurement
): boolean {
  return (
    row.base_value != null ||
    row.target_value != null ||
    row.sewn_value != null ||
    row.adjustment != null ||
    Boolean(row.remarks?.trim()) ||
    Boolean(row.remark?.trim())
  );
}

/**
 * Curated reduced rows in Pattern's preferred order / names.
 * Falls back to dictionary name when a preferred id is missing.
 */
export function buildReducedMeasurementsFromTemplate(
  dictionary: MeasurementPointDef[],
  garmentType: string
): ClientPatternMeasurement[] {
  const byId = new Map(dictionary.map((point) => [point.id, point]));
  return reducedPointSpecsForGarment(garmentType).map((spec) => {
    const point = byId.get(spec.point_id);
    return emptyMeasurementRow(spec.point_id, spec.name || point?.name || spec.point_id);
  });
}

/**
 * Merge a rebuilt template onto an existing trial.
 * Entire: keep custom extras not in the template (legacy behaviour).
 * Reduced: drop empty dictionary clutter; keep only template rows + any
 * prior rows that already have entered values.
 */
export function mergeTemplateMeasurements(
  template: ClientPatternMeasurement[],
  existing: ClientPatternMeasurement[],
  mode: MeasurementTemplateMode
): ClientPatternMeasurement[] {
  const existingByPoint = new Map(existing.map((row) => [row.point_id, row]));
  const merged = template.map((row) => {
    const prior = existingByPoint.get(row.point_id);
    if (!prior) return row;
    return {
      ...row,
      base_value: prior.base_value,
      target_value: prior.target_value,
      sewn_value: prior.sewn_value,
      adjustment: prior.adjustment,
      remarks: prior.remarks,
      remark: prior.remark ?? row.remark,
    };
  });
  const inTemplate = new Set(merged.map((row) => row.point_id));
  for (const prior of existing) {
    if (inTemplate.has(prior.point_id)) continue;
    if (mode === "reduced" && !measurementRowHasEnteredValue(prior)) continue;
    merged.push(prior);
  }
  return merged;
}
