/** Cutter handoff vs stitcher / production measurement sheet. */
export type PatternSheetKind = "cutter" | "production";

/** Parse `?sheet=` query; unknown values default to cutter. */
export function parsePatternSheetKind(raw: string | null | undefined): PatternSheetKind {
  return raw === "production" ? "production" : "cutter";
}

export function patternSheetKindLabel(kind: PatternSheetKind): string {
  return kind === "production" ? "Production" : "Cutter";
}
