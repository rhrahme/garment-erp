import { preferredBrandCodeFromClientCode } from "@/lib/pattern-library/base-pattern-picker";
import {
  pieceAbbrev,
  piecesForPatternJob,
  withPieceIndexMark,
} from "@/lib/sales-orders/label-codes";
import type { PatternJob } from "@/lib/types/pattern";

/** ASCII-safe segment for Tuka .TUD filenames (letters, digits, hyphen). */
function tudSegment(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** SO-2026-0132 -> 0132; SO-0132 -> 0132. */
export function shortSoNumber(soNumber: string): string {
  const digits = soNumber.replace(/\D/g, "");
  if (!digits) return "0000";
  return digits.slice(-4).padStart(4, "0");
}

/**
 * Stable unique code Pattern pastes as the .TUD filename in Tuka (garment-level).
 * Example: FR-0132-L07-SUIT (brand + SO short + article + garment).
 * Multi-piece garments use per-piece codes from listTudPiecePatternCodes instead.
 */
export function generateTudPatternCode(
  job: Pick<
    PatternJob,
    "client_code" | "so_number" | "article_number" | "garment_type"
  >
): string {
  const brand =
    preferredBrandCodeFromClientCode(job.client_code) ||
    tudSegment(job.client_code).slice(0, 4) ||
    "PAT";
  const so = shortSoNumber(job.so_number);
  const article = `L${String(job.article_number).padStart(2, "0")}`;
  const garment = tudSegment(job.garment_type) || "GARMENT";
  return `${brand}-${so}-${article}-${garment}`;
}

/** True when pattern_code is missing or blank. */
export function needsTudPatternCode(patternCode: string | null | undefined): boolean {
  return !patternCode || !patternCode.trim();
}

export type TudPiecePatternCode = {
  piece_name: string;
  /** Manufacturing-aligned Tuka filename stem, e.g. FR-0132-L07-JKT-1/2. */
  code: string;
  index: number;
  total: number;
};

/**
 * Per-piece .TUD filename codes - same shape as floor manufacturing codes
 * (abbrev + optional -n/N). Suit -> JKT-1/2 + TR-2/2; single-piece -> one code
 * without an index mark.
 */
export function generateTudPiecePatternCode(
  job: Pick<PatternJob, "client_code" | "so_number" | "article_number">,
  pieceName: string,
  index1Based: number,
  total: number
): string {
  const brand =
    preferredBrandCodeFromClientCode(job.client_code) ||
    tudSegment(job.client_code).slice(0, 4) ||
    "PAT";
  const so = shortSoNumber(job.so_number);
  const article = `L${String(job.article_number).padStart(2, "0")}`;
  const abbrev = pieceAbbrev(pieceName) || tudSegment(pieceName) || "PIECE";
  return withPieceIndexMark(`${brand}-${so}-${article}-${abbrev}`, index1Based, total);
}

/** Ordered per-piece TUD filename codes for a pattern job. */
export function listTudPiecePatternCodes(
  job: Pick<
    PatternJob,
    | "client_code"
    | "so_number"
    | "article_number"
    | "garment_type"
    | "piece_names"
    | "piece_name"
  >
): TudPiecePatternCode[] {
  const pieces = piecesForPatternJob(job);
  const total = pieces.length;
  return pieces.map((piece_name, index) => ({
    piece_name,
    code: generateTudPiecePatternCode(job, piece_name, index + 1, total),
    index: index + 1,
    total,
  }));
}
