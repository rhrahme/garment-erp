/**
 * Measurement sheet templates: entire dictionary vs a curated reduced list.
 * Trousers default to reduced - Pattern asked for the common stitcher set.
 * Compounds (Overshirt+Trouser, Suit, Suit+Vest, Shirt+Trouser, ...) keep
 * other pieces' full dictionaries plus the reduced trouser set.
 * Piece order comes from getGarmentPieces (same as stickers / nest).
 */

import {
  libraryGarmentKeysForSheet,
  normalizePatternSheetGarment,
} from "@/lib/pattern-library/base-pattern-picker";
import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
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
  // Prefer trouser-only Bottom width - do not reuse overshirt/shirt
  // `1-2-hem-width` or Waist Relax lands under Overshirt on OT sheets.
  { point_id: "bottom-width", name: "1/2 Bottom width" },
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

/**
 * Piece tokens in sticker / nest order.
 * Suit -> Jacket, Trouser; Suit+Vest -> Jacket, Vest, Trouser (not "suit" as one token).
 */
export function measurementPieceTokensForGarment(garmentType: string): string[] {
  const trimmed = garmentType.trim();
  if (!trimmed) return [];
  const normalized = normalizePatternSheetGarment(trimmed) || trimmed;
  const pieces = getGarmentPieces(normalized);
  if (pieces.length > 0) return pieces;
  return [normalized];
}

/** True only for the trouser piece - not Suit / Suit+Vest as a whole. */
export function pieceIsTrouser(pieceName: string): boolean {
  const lower = pieceName.trim().toLowerCase();
  return lower === "trouser" || lower === "trousers" || lower === "pants";
}

function normalizePointLabel(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Extra display names Pattern types for reduced trouser points. */
const TROUSER_POINT_NAME_ALIASES: ReadonlyArray<string> = [
  "waist relax",
  "1/2 waist relax",
  "1/2 waist relux",
  "waist relux",
  "waist (relux)",
  "waist (relax)",
  "1/2 bottom hem",
  "bottom hem",
  "side pocket height",
];

/**
 * Shared with tops (overshirt/shirt hem). Not trouser-exclusive by id alone.
 */
const SHARED_TOP_TROUSER_POINT_IDS = new Set(["1-2-hem-width", "1-2-waist"]);

/**
 * When a row is clearly a trouser measurement (by id or label), it must not
 * appear under Overshirt / Jacket / Shirt even if a shared hem/waist id matches.
 */
export function measurementPointExclusivePiece(point: {
  point_id: string;
  name?: string | null;
}): "trouser" | null {
  const name = normalizePointLabel(point.name);
  const id = point.point_id;

  if (
    /^(1\/2\s+)?waist\s*rel[au]x$/.test(name) ||
    /^waist\s*\(\s*rel[au]x\s*\)$/.test(name) ||
    name === "front rise" ||
    name === "back rise" ||
    name === "inseam length" ||
    name.startsWith("outseam") ||
    name === "fly length" ||
    name === "waistband height" ||
    name === "1/2 thigh" ||
    name === "1/2 knee" ||
    name === "1/2 hip" ||
    name.startsWith("side pocket") ||
    name === "front hip" ||
    name === "front thigh" ||
    name === "front knee" ||
    name === "front hem" ||
    /bottom/.test(name)
  ) {
    return "trouser";
  }

  for (const pointSpec of REDUCED_TROUSER_POINTS) {
    if (pointSpec.point_id === id && !SHARED_TOP_TROUSER_POINT_IDS.has(id)) {
      return "trouser";
    }
  }
  if (id === "waist-relux" || id === "bottom-width" || id === "1-2-bottom-leg-opening") {
    return "trouser";
  }
  return null;
}

function pointMatchesStitcherPiece(
  point: { point_id: string; name?: string | null },
  pieceName: string,
  allow: { ids: Set<string>; names: Set<string> }
): boolean {
  const exclusive = measurementPointExclusivePiece(point);
  if (exclusive === "trouser") return pieceIsTrouser(pieceName);
  const label = normalizePointLabel(point.name);
  return allow.ids.has(point.point_id) || (label !== "" && allow.names.has(label));
}

export function garmentOffersReducedMeasurementTemplate(garmentType: string): boolean {
  return measurementPieceTokensForGarment(garmentType).some((token) =>
    pieceIsTrouser(token)
  );
}

/** Default when creating a sheet: reduced when any piece is trouser. */
export function defaultMeasurementTemplateMode(
  garmentType: string
): MeasurementTemplateMode {
  return garmentOffersReducedMeasurementTemplate(garmentType) ? "reduced" : "entire";
}

type DictionaryPointRef = Pick<MeasurementPointDef, "id" | "garment_types"> & {
  name?: string;
};

function dictionaryPointsForPiece(
  dictionary: DictionaryPointRef[],
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
    .map((point) => ({
      point_id: point.id,
      name: point.name ?? point.id,
    }));
}

/** Allow-list for one stitcher piece page (ids + display names). */
export function stitcherPieceAllowList(
  pieceName: string,
  dictionary: DictionaryPointRef[]
): { ids: Set<string>; names: Set<string> } {
  const specs = dictionaryPointsForPiece(dictionary, pieceName);
  const ids = new Set(specs.map((point) => point.point_id));
  const names = new Set(
    specs.map((point) => point.name.trim().toLowerCase()).filter(Boolean)
  );
  if (pieceIsTrouser(pieceName)) {
    for (const point of REDUCED_TROUSER_POINTS) {
      ids.add(point.point_id);
      names.add(point.name.trim().toLowerCase());
    }
    // Legacy shared hem id still present on older sheets.
    ids.add("1-2-hem-width");
    for (const alias of TROUSER_POINT_NAME_ALIASES) {
      names.add(alias);
    }
  }
  return { ids, names };
}

/**
 * Point ids that belong on one stitcher piece page (Overshirt / Trouser / ...).
 * Trouser always includes the reduced stitcher set.
 */
export function pointIdsForStitcherPiece(
  pieceName: string,
  dictionary: DictionaryPointRef[]
): Set<string> {
  return stitcherPieceAllowList(pieceName, dictionary).ids;
}

/** True for set garments (Overshirt+Trouser, Shirt+Short, Suit, ...). */
export function garmentIsMeasurementSet(garmentType: string): boolean {
  return measurementPieceTokensForGarment(garmentType).length > 1;
}

/**
 * Sheet rows for one selected set-garment piece (same allow-list as stitcher A4).
 * Preserves sheet order. Empty piece name returns no rows.
 */
export function filterTrialSheetPointsForPiece<
  T extends { point_id: string; name?: string | null },
>(
  points: T[],
  pieceName: string,
  dictionary: DictionaryPointRef[]
): T[] {
  const trimmed = pieceName.trim();
  if (!trimmed) return [];
  const allow = stitcherPieceAllowList(trimmed, dictionary);
  return points.filter((point) => pointMatchesStitcherPiece(point, trimmed, allow));
}

export type TrialSheetPieceSection<
  T extends { point_id: string; name?: string | null } = {
    point_id: string;
    name: string;
  },
> = {
  key: string;
  /** Null when the garment is a single piece (no section chrome). */
  label: string | null;
  points: T[];
};

/**
 * Bucket sheet rows by stitcher piece for compound garments
 * (Overshirt+Trouser, Suit, ...). Preserves relative order within each bucket.
 * Points that match more than one piece go under Shared; unmatched under Other.
 * Single-piece garments return one unlabeled section with all rows.
 */
export function groupTrialSheetPointsByPiece<
  T extends { point_id: string; name?: string | null },
>(
  points: T[],
  garmentType: string,
  dictionary: DictionaryPointRef[]
): TrialSheetPieceSection<T>[] {
  const pieces = measurementPieceTokensForGarment(garmentType);
  if (pieces.length <= 1) {
    return [{ key: "all", label: null, points: [...points] }];
  }
  // Without dictionary, top pieces have empty allow-lists - keep flat until loaded.
  if (dictionary.length === 0) {
    return [{ key: "all", label: null, points: [...points] }];
  }

  const allows = pieces.map((piece) => ({
    piece,
    allow: stitcherPieceAllowList(piece, dictionary),
  }));

  const byPiece = new Map<string, T[]>(pieces.map((piece) => [piece, []]));
  const shared: T[] = [];
  const other: T[] = [];

  for (const point of points) {
    const matching = allows.filter(({ piece, allow }) =>
      pointMatchesStitcherPiece(point, piece, allow)
    );
    if (matching.length === 1) {
      byPiece.get(matching[0]!.piece)!.push(point);
    } else if (matching.length > 1) {
      shared.push(point);
    } else {
      other.push(point);
    }
  }

  const sections: TrialSheetPieceSection<T>[] = [];
  for (const piece of pieces) {
    const bucket = byPiece.get(piece) ?? [];
    if (bucket.length === 0) continue;
    sections.push({ key: `piece:${piece}`, label: piece, points: bucket });
  }
  if (shared.length > 0) {
    sections.push({ key: "shared", label: "Shared", points: shared });
  }
  if (other.length > 0) {
    sections.push({ key: "other", label: "Other", points: other });
  }
  return sections;
}

/**
 * Keep sheet rows for one stitcher piece. Preserves sheet order.
 * Matches point_id and/or measurement name (sheet rows sometimes drift ids).
 * When `allowedIds` is null/undefined, returns all rows (no filter).
 * Empty allow-list returns no rows (never dump the full compound sheet).
 */
export function filterMeasurementsForStitcherPiece<
  T extends { point_id: string; name?: string | null },
>(
  measurements: T[],
  allowedIds: Iterable<string> | null | undefined,
  allowedNames?: Iterable<string> | null
): T[] {
  if (allowedIds == null && allowedNames == null) return measurements;
  const ids = allowedIds instanceof Set ? allowedIds : new Set(allowedIds ?? []);
  const names = new Set(
    [...(allowedNames ?? [])].map((name) => name.trim().toLowerCase()).filter(Boolean)
  );
  if (ids.size === 0 && names.size === 0) return [];
  return measurements.filter((row) => {
    if (ids.has(row.point_id)) return true;
    const label = row.name?.trim().toLowerCase();
    return Boolean(label && names.has(label));
  });
}

/**
 * Reduced specs for one piece: curated trouser list, else full dictionary
 * for that piece (overshirt / jacket / shirt / ...).
 */
export function reducedPointSpecsForPiece(
  dictionary: DictionaryPointRef[],
  token: string
): ReadonlyArray<{ point_id: string; name: string }> {
  if (pieceIsTrouser(token)) return REDUCED_TROUSER_POINTS;
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
