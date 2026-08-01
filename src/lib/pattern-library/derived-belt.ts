/**
 * Some shop shorts markers include a waistband "belt" strip that is present in
 * TUKAmark but omitted from the AAMA DXF / TUD export (only front + back blocks).
 * Derive a rectangular belt from measurement-sheet waist + waistband height so
 * nest length matches the cutter's real marker more closely.
 */

import type {
  ClientPattern,
  DxfMetadata,
  DxfPiece,
  MeasurementUnit,
} from "@/lib/types/pattern-library";

const BELT_NAME_RE = /^(belt|waist\s*band|waistband|wb)$/i;

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function unitToCm(value: number, unit: MeasurementUnit | string | null | undefined): number {
  const u = (unit ?? "in").toString().trim().toLowerCase();
  if (u === "cm" || u === "centimeter" || u === "centimetre") return value;
  return value * 2.54; // inches default for this shop's pattern sheets
}

function measurementValue(
  pattern: ClientPattern,
  pointIds: string[],
  nameMatchers: RegExp[]
): number | null {
  const versions = pattern.versions ?? [];
  const version =
    versions.find((v) => v.id === pattern.final_version_id) ??
    versions[versions.length - 1];
  const rows = version?.measurements;
  if (!Array.isArray(rows)) return null;

  for (const row of rows) {
    const id = (row.point_id ?? "").toLowerCase();
    const name = (row.name ?? "").toLowerCase();
    const hitId = pointIds.some((p) => id === p.toLowerCase());
    const hitName = nameMatchers.some((re) => re.test(name));
    if (!hitId && !hitName) continue;
    const raw = row.target_value ?? row.base_value;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function rectOutlineCm(widthCm: number, heightCm: number): Array<{ x: number; y: number }> {
  return [
    { x: 0, y: 0 },
    { x: widthCm, y: 0 },
    { x: widthCm, y: heightCm },
    { x: 0, y: heightCm },
  ];
}

export function dxfHasBeltPiece(dxf: DxfMetadata): boolean {
  return dxf.pieces.some((p) => BELT_NAME_RE.test(p.name.trim()));
}

/**
 * Build a belt / waistband rectangle from pattern measurements.
 * Length ~= 1/2 waist (shop strips are cut to the half-waist length on the sheet).
 * Height ~= 2x waistband height (cut folded band).
 */
export function buildDerivedBeltPiece(pattern: ClientPattern): DxfPiece | null {
  const halfWaist = measurementValue(
    pattern,
    ["1-2-waist-straight-relux", "1-2-waist", "half-waist"],
    [/1\s*\/\s*2\s*waist/, /half\s*waist/, /^waist$/]
  );
  const bandHeight = measurementValue(
    pattern,
    ["waist-band-height", "waistband-height"],
    [/waist\s*band\s*height/, /waistband\s*height/]
  );
  if (halfWaist == null || bandHeight == null) return null;

  const lengthCm = round(unitToCm(halfWaist, pattern.unit), 2);
  // Folded waistband cut width: 2x finished height (matches shop strip cutting).
  const heightCm = round(unitToCm(bandHeight, pattern.unit) * 2, 2);
  if (!(lengthCm > 1) || !(heightCm > 0.2)) return null;

  return {
    name: "belt",
    cut_quantity: 1,
    fabric: "SHEEL",
    size: pattern.base_size ?? null,
    width_cm: lengthCm,
    height_cm: heightCm,
    area_m2: round((lengthCm * heightCm) / 10_000, 4),
    perimeter_cm: round(2 * (lengthCm + heightCm), 2),
    outline_cm: rectOutlineCm(lengthCm, heightCm),
  };
}

/**
 * If the DXF has no belt/waistband piece, append a measurement-derived rectangle.
 * Returns the original metadata when a named belt already exists or inputs are missing.
 */
export function augmentDxfWithDerivedBelt(
  dxf: DxfMetadata,
  pattern: ClientPattern
): DxfMetadata {
  if (dxfHasBeltPiece(dxf)) return dxf;
  const belt = buildDerivedBeltPiece(pattern);
  if (!belt) return dxf;

  // Prefer size from existing DXF pieces when pattern base_size is unset.
  if (!belt.size) {
    belt.size = dxf.pieces.find((p) => p.size)?.size ?? dxf.sizes[0] ?? null;
  }

  const pieces = [...dxf.pieces, belt];
  const sizes = Array.from(
    new Set(
      [
        ...dxf.sizes,
        ...pieces.map((p) => p.size).filter((s): s is string => Boolean(s && s.trim())),
      ].map((s) => s.trim())
    )
  );

  return {
    ...dxf,
    pieces,
    sizes,
    total_cut_pieces: pieces.reduce((sum, p) => sum + (p.cut_quantity ?? 1), 0),
  };
}
