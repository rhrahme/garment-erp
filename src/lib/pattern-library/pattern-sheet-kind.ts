/** Cutter handoff, stitcher measurement sheet, or one sewing A4 per article. */
export type PatternSheetKind = "cutter" | "production" | "sewing";

/** Parse `?sheet=` query; unknown values default to cutter. */
export function parsePatternSheetKind(raw: string | null | undefined): PatternSheetKind {
  if (raw === "production") return "production";
  if (raw === "sewing") return "sewing";
  return "cutter";
}

export function patternSheetKindLabel(kind: PatternSheetKind): string {
  if (kind === "production") return "Production";
  if (kind === "sewing") return "Sewing";
  return "Cutter";
}

/** Parse `?lines=id1,id2` for sewing A4 page selection. */
export function parsePatternSheetLineIds(raw: string | null | undefined): string[] | null {
  if (raw == null) return null;
  const ids = String(raw)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : [];
}
