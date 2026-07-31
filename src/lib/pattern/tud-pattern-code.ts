import { preferredBrandCodeFromClientCode } from "@/lib/pattern-library/base-pattern-picker";
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
 * Stable unique code Pattern pastes as the .TUD filename in Tuka.
 * Example: FR-0132-L07-SUIT (brand + SO short + article + garment).
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
