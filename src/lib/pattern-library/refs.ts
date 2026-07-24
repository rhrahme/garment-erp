/** Pattern-ref generation in the team's format: SS-SHIRT-LINEN-FR-REG-XXL. */

function cutFamilyAbbrev(cutFamily: string): string {
  const words = cutFamily.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  // Multi-word families use initials (Suit Supply -> SS); single words stay whole (COMFORT).
  if (words.length > 1) return words.map((word) => word[0]!.toUpperCase()).join("");
  return words[0]!.toUpperCase();
}

function variantAbbrev(variant: string | null): string | null {
  if (!variant) return null;
  const clean = variant.trim().toUpperCase();
  if (!clean) return null;
  if (clean === "REGULAR") return "REG";
  return clean;
}

function refSegment(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.trim().toUpperCase().replace(/\s+/g, "-");
  return clean || null;
}

export function generatePatternRef(input: {
  cut_family?: string | null;
  garment_type?: string | null;
  fabric?: string | null;
  house_brand_code?: string | null;
  cut_variant?: string | null;
  size?: string | null;
}): string {
  const segments = [
    input.cut_family ? cutFamilyAbbrev(input.cut_family) : null,
    refSegment(input.garment_type),
    refSegment(input.fabric),
    refSegment(input.house_brand_code),
    variantAbbrev(input.cut_variant ?? null),
    refSegment(input.size),
  ].filter((segment): segment is string => Boolean(segment));
  return segments.join("-");
}
