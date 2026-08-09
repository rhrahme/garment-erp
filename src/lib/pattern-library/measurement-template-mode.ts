/**
 * Measurement sheet templates: entire dictionary vs a curated reduced list.
 * Trousers default to reduced - Pattern asked for the common stitcher set.
 * Compounds (Overshirt+Trouser, Suit) keep other pieces' full dictionaries
 * plus the reduced trouser set.
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

/** Piece tokens in sheet order (Overshirt+Trouser -> overshirt, trouser). */
export function measurementPieceTokensForGarment(garmentType: string): string[] {
  const lower = garmentType.trim().toLowerCase();
  if (!lower) return [];
  if (lower.includes("+")) {
    return lower
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  // Suit is one sheet for jacket + trouser.
  if (lower === "suit") return ["jacket", "trouser"];
  return [lower];
}

function pieceHasTrouser(token: string): boolean {
  const keys = libraryGarmentKeysForSheet(token).map((key) => key.toLowerCase());
  return keys.some((key) => key === "trouser" || key === "trousers" || key === "pants");
}

export function garmentOffersReducedMeasurementTemplate(garmentType: string): boolean {
  return measurementPieceTokensForGarment(garmentType).some((token) =>
    pieceHasTrouser(token)
  );
}

/** Default when creating a sheet: reduced when any piece is trouser. */
export function defaultMeasurementTemplateMode(
  garmentType: string
): MeasurementTemplateMode {
  return garmentOffersReducedMeasurementTemplate(garmentType) ? "reduced" : "entire";
}

function dictionaryPointsForPiece(
  dictionary: MeasurementPointDef[],
  token: string
): Array<{ point_id: string; name: string }> {
  const keys = new Set(
    libraryGarmentKeysForSheet(token).map((key) => key.toLowerCase())
  );
  keys.add(token.trim().toLowerCase());
  return dictionary
    .filter((point) =>
      point.garment_types.some((type) => keys.has(type.toLowerCase()))
    )
    .map((point) => ({ point_id: point.id, name: point.name }));
}

/**
 * Reduced specs for one piece: curated trouser list, else full dictionary
 * for that piece (overshirt / jacket / shirt / …).
 */
export function reducedPointSpecsForPiece(
  dictionary: MeasurementPointDef[],
  token: string
): ReadonlyArray<{ point_id: string; name: string }> {
  if (pieceHasTrouser(token)) return REDUCED_TROUSER_POINTS;
  return dictionaryPointsForPiece(dictionary, token);
}

/**
 * Composed reduced list for the sheet garment (deduped by point_id, piece order).
 */
export function reducedPointSpecsForGarment(
  dictionary: MeasurementPointDef[],
  garmentType: string
): ReadonlyArray<{ point_id: string; name: string }> {
  if (!garmentOffersReducedMeasurementTemplate(garmentType)) return [];
  const seen = new Set<string>();
  const specs: Array<{ point_id: string; name: string }> = [];
  for (const token of measurementPieceTokensForGarment(garmentType)) {
    for (const spec of reducedPointSpecsForPiece(dictionary, token)) {
      if (seen.has(spec.point_id)) continue;
      seen.add(spec.point_id);
      specs.push(spec);
    }
  }
  return specs;
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
 * Curated / composed reduced rows in Pattern's preferred order / names.
 */
export function buildReducedMeasurementsFromTemplate(
  dictionary: MeasurementPointDef[],
  garmentType: string
): ClientPatternMeasurement[] {
  const byId = new Map(dictionary.map((point) => [point.id, point]));
  return reducedPointSpecsForGarment(dictionary, garmentType).map((spec) => {
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
