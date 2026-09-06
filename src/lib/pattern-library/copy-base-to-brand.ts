import { BRAND_CLIENT_CODE_PREFIX } from "@/lib/clients/codes";
import type { BasePattern, BasePatternPoint } from "@/lib/types/pattern-library";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** GL-44 -> FR-44, GL_shirt.dxf -> FR_shirt.dxf. Leaves unrelated text alone. */
export function rewriteBrandLabel(text: string, fromCode: string, toCode: string): string {
  const from = fromCode.trim().toUpperCase();
  const to = toCode.trim().toUpperCase();
  if (!from || !to || from === to) return text;
  const token = escapeRegExp(from);
  return text.replace(new RegExp(`(^|[^A-Za-z0-9])${token}(?=[^A-Za-z]|$)`, "gi"), `$1${to}`);
}

export function rewriteSizeList(sizes: string[], fromCode: string, toCode: string): string[] {
  return sizes.map((size) => rewriteBrandLabel(size, fromCode, toCode));
}

export function rewritePointForBrand(
  point: BasePatternPoint,
  fromCode: string,
  toCode: string
): BasePatternPoint {
  const values: Record<string, number | null> = {};
  for (const [size, value] of Object.entries(point.values)) {
    values[rewriteBrandLabel(size, fromCode, toCode)] = value;
  }
  return { ...point, values };
}

export function brandCodeForId(brandId: string): string | null {
  return BRAND_CLIENT_CODE_PREFIX[brandId] ?? null;
}

export function sameHouseCut(left: BasePattern, right: BasePattern): boolean {
  return (
    left.garment_type.trim().toLowerCase() === right.garment_type.trim().toLowerCase() &&
    left.cut_family.trim().toLowerCase() === right.cut_family.trim().toLowerCase() &&
    (left.cut_variant ?? "").trim().toLowerCase() === (right.cut_variant ?? "").trim().toLowerCase()
  );
}

export function findMatchingBaseOnBrand(
  bases: BasePattern[],
  source: BasePattern,
  targetBrandId: string
): BasePattern | null {
  return (
    bases.find(
      (base) => base.house_brand_id === targetBrandId && sameHouseCut(base, source)
    ) ?? null
  );
}

export function buildCopiedBaseInput(
  source: BasePattern,
  target: { house_brand_id: string; house_brand_code: string }
) {
  const fromCode = source.house_brand_code;
  const toCode = target.house_brand_code;
  return {
    house_brand_id: target.house_brand_id,
    house_brand_code: toCode,
    cut_family: source.cut_family,
    garment_type: source.garment_type,
    cut_variant: source.cut_variant,
    name: rewriteBrandLabel(source.name, fromCode, toCode),
    unit: source.unit,
    sizes: rewriteSizeList(source.sizes, fromCode, toCode),
    points: source.points.map((point) => rewritePointForBrand(point, fromCode, toCode)),
    style_code: source.style_code ? rewriteBrandLabel(source.style_code, fromCode, toCode) : null,
    fabric: source.fabric,
    season: source.season,
    special_instructions: source.special_instructions,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    notes: source.notes,
  };
}
