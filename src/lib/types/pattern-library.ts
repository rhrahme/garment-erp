/**
 * Pattern Library — digitized base patterns (house-brand size grids) and
 * client patterns derived from them. Replaces the pattern team's Excel files.
 * The app never designs patterns; it organizes, tracks and stores them.
 */

export type MeasurementUnit = "in" | "cm";

export type PatternLibraryFileKind = "tud" | "xlsx" | "dxf" | "pdf" | "image" | "other";

/** Canonical measurement point with known aliases (e.g. "1/2 Hem Width" ≡ "1/2 Bottom Width"). */
export interface MeasurementPointDef {
  id: string;
  name: string;
  aliases: string[];
  /** Garment templates this point typically belongs to (jacket, shirt, shorts, ...). */
  garment_types: string[];
}

/** One cut piece from a .TUD header (-P/-Q/-M/-E records). */
export interface TudPiece {
  name: string;
  /** How many of this piece are cut per garment (-Q). */
  cut_quantity: number | null;
  /** Fabric assignment (-M): e.g. SHEEL (shell), FINISH (fusing), CONTASH (contrast). */
  fabric: string | null;
  /** size -> single-piece area (m²) and perimeter (cm) from -E records. */
  per_size: Record<string, { area_m2: number; perimeter_cm: number }>;
}

/** Per-fabric totals for one size (-X records; all pieces × quantities). */
export interface TudFabricTotal {
  size: string;
  fabric: string;
  area_m2: number;
  perimeter_cm: number;
}

/** Grand totals for one size (-Y records). */
export interface TudSizeTotal {
  size: string;
  area_m2: number;
  perimeter_cm: number;
}

/** Metadata parsed from a TUKA CAD .tud file header. */
export interface TudMetadata {
  style_caption: string | null;
  /** Original path on the CAD workstation (/F record) — reveals folder/garment hints. */
  source_path: string | null;
  sizes: string[];
  pieces: TudPiece[];
  /** Sum of piece cut quantities (pieces to cut per garment). */
  total_cut_pieces: number | null;
  fabric_totals: TudFabricTotal[];
  size_totals: TudSizeTotal[];
  /** Convenience: total fabric area (m²) for the single-size case, else null. */
  total_area_m2: number | null;
  total_perimeter_cm: number | null;
}

export interface PatternLibraryAttachment {
  id: string;
  kind: PatternLibraryFileKind;
  filename: string;
  stored_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string | null;
  /** Parsed TUKA CAD metadata for .tud uploads (absent/null when not parseable). */
  tud?: TudMetadata | null;
  /** Sibling JPEG preview extracted from the .tud, stored next to the file. */
  thumbnail_stored_filename?: string | null;
}

/** One measurement row on a base pattern: values per size, nullable (sparse grids are real). */
export interface BasePatternPoint {
  point_id: string;
  /** Display name as written on this pattern (may be an alias of the canonical name). */
  name: string;
  /** e.g. "Front", "Including Cuff", "Position: Slit Point". */
  remark: string | null;
  /** false = trim point constant across sizes (collar height, band height, placket...). */
  is_graded: boolean;
  /** Tech-pack extras (Hagan shorts format); null when not documented. */
  tolerance: number | null;
  grading_increment: number | null;
  diagram_code: string | null;
  /** size -> value; null preserves declared-but-empty cells. */
  values: Record<string, number | null>;
}

export interface BasePattern {
  id: string;
  /** Factory brand id (fouad-rahme, gliani) + display code (FR, GL). */
  house_brand_id: string;
  house_brand_code: string;
  /** Cut family: Suit Supply, Massimo, Boggi, Comfort (house cut without source brand). */
  cut_family: string;
  /** jacket, shirt, shorts, trouser, thobe, ... */
  garment_type: string;
  /** Regular / Long / Short — null when the family has a single cut. */
  cut_variant: string | null;
  name: string;
  unit: MeasurementUnit;
  /** Ordered size run (EU numeric, collar, alpha, or prefixed R-/L-/S-). */
  sizes: string[];
  points: BasePatternPoint[];
  style_code: string | null;
  fabric: string | null;
  season: string | null;
  special_instructions: string | null;
  physical_pattern_kept: boolean;
  physical_pattern_location: string | null;
  files: PatternLibraryAttachment[];
  /** Original Excel filename when imported. */
  source_file: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** One measurement row on a client pattern version (trial). */
export interface ClientPatternMeasurement {
  point_id: string;
  name: string;
  remark: string | null;
  is_graded: boolean;
  /** Value inherited from the base pattern at the derived size. */
  base_value: number | null;
  /** Target for this trial (starts as base value, adjusted between trials). */
  target_value: number | null;
  /** Measured on the sewn trial garment. */
  sewn_value: number | null;
  /** Correction to apply for the next trial. */
  adjustment: number | null;
  remarks: string | null;
}

export interface ClientPatternVersion {
  id: string;
  version: number;
  is_final: boolean;
  trial_date: string | null;
  measurements: ClientPatternMeasurement[];
  special_instructions: string | null;
  notes: string | null;
  files: PatternLibraryAttachment[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientPattern {
  id: string;
  /** e.g. SS-SHIRT-LINEN-FR-REG-XXL — auto-generated, editable. */
  pattern_ref: string;
  client_id: string;
  client_code: string;
  client_name: string;
  garment_type: string;
  description: string | null;
  /** Derivation linkage: base pattern + size it was cut from. */
  base_pattern_id: string | null;
  base_size: string | null;
  house_brand_id: string | null;
  house_brand_code: string | null;
  fabric: string | null;
  unit: MeasurementUnit;
  versions: ClientPatternVersion[];
  final_version_id: string | null;
  special_instructions: string | null;
  physical_pattern_kept: boolean;
  physical_pattern_location: string | null;
  files: PatternLibraryAttachment[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatternLibraryFile {
  updated_at: string | null;
  dictionary: MeasurementPointDef[];
  base_patterns: BasePattern[];
  client_patterns: ClientPattern[];
}

export const EMPTY_PATTERN_LIBRARY: PatternLibraryFile = {
  updated_at: null,
  dictionary: [],
  base_patterns: [],
  client_patterns: [],
};
