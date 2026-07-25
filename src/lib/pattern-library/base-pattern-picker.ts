import { parseClientCodeParts } from "@/lib/clients/codes";
import type { BasePattern } from "@/lib/types/pattern-library";

/** Owner's preferred garment order; unknown types sort after, alphabetically. */
export const PICKER_GARMENT_ORDER = [
  "suit",
  "jacket",
  "overshirt",
  "shirt",
  "vest",
  "trouser",
  "shorts",
  "thobe",
  "polo",
  "t-shirt",
];

export type CascadeOrigin = "custom" | "library";

export type BasePatternCascadeValue = {
  garmentType: string;
  origin: CascadeOrigin;
  houseBrandCode: string;
  cutFamily: string;
  /** Empty string means "no variant" (null on the base). */
  cutVariant: string;
  basePatternId: string;
  baseSize: string;
};

export type BasePatternCascadeFilters = {
  houseBrandCode?: string | null;
  garmentType?: string | null;
  cutFamily?: string | null;
  /** `undefined` = any; `""` = bases with null/empty variant. */
  cutVariant?: string | null;
  basePatternId?: string | null;
};

export function emptyCascadeValue(
  preferredBrandCode?: string | null
): BasePatternCascadeValue {
  return {
    garmentType: "",
    origin: "custom",
    houseBrandCode: preferredBrandCode ?? "",
    cutFamily: "",
    cutVariant: "",
    basePatternId: "",
    baseSize: "",
  };
}

/** House brand code from client code prefix (FR-0626-0035 → FR). */
export function preferredBrandCodeFromClientCode(
  clientCode: string | null | undefined
): string | null {
  const parts = parseClientCodeParts((clientCode ?? "").trim().toUpperCase());
  return parts?.prefix ?? null;
}

export function garmentLabel(garment: string): string {
  if (!garment) return "";
  return garment.charAt(0).toUpperCase() + garment.slice(1);
}

function garmentRank(garment: string): number {
  const index = PICKER_GARMENT_ORDER.indexOf(garment.trim().toLowerCase());
  return index === -1 ? PICKER_GARMENT_ORDER.length : index;
}

export function compareGarments(a: string, b: string): number {
  return garmentRank(a) - garmentRank(b) || a.localeCompare(b);
}

export function filterBases(
  bases: BasePattern[],
  filters: BasePatternCascadeFilters
): BasePattern[] {
  return bases.filter((base) => {
    if (filters.houseBrandCode && base.house_brand_code !== filters.houseBrandCode) {
      return false;
    }
    if (filters.garmentType && base.garment_type !== filters.garmentType) {
      return false;
    }
    if (filters.cutFamily && base.cut_family !== filters.cutFamily) {
      return false;
    }
    if (filters.cutVariant !== undefined && filters.cutVariant !== null) {
      const variant = base.cut_variant ?? "";
      if (variant !== filters.cutVariant) return false;
    }
    if (filters.basePatternId && base.id !== filters.basePatternId) {
      return false;
    }
    return true;
  });
}

function uniqueSorted(values: string[], compare?: (a: string, b: string) => number): string[] {
  return [...new Set(values.filter(Boolean))].sort(compare ?? ((a, b) => a.localeCompare(b)));
}

export function uniqueBrandCodes(bases: BasePattern[]): string[] {
  return uniqueSorted(bases.map((base) => base.house_brand_code));
}

export function uniqueGarmentTypes(bases: BasePattern[], extra: string[] = []): string[] {
  return uniqueSorted(
    [...bases.map((base) => base.garment_type), ...extra],
    compareGarments
  );
}

export function uniqueCutFamilies(bases: BasePattern[]): string[] {
  return uniqueSorted(bases.map((base) => base.cut_family));
}

/** Includes "" for bases with no cut_variant. */
export function uniqueCutVariants(bases: BasePattern[]): string[] {
  const variants = bases.map((base) => base.cut_variant ?? "");
  const hasEmpty = variants.some((variant) => variant === "");
  const named = uniqueSorted(variants.filter(Boolean));
  return hasEmpty ? ["", ...named] : named;
}

export function resolveSelectedBase(
  bases: BasePattern[],
  value: BasePatternCascadeValue
): BasePattern | null {
  if (value.origin !== "library" || !value.basePatternId) return null;
  return bases.find((base) => base.id === value.basePatternId) ?? null;
}

/**
 * After narrowing brand/garment/family/variant, auto-pick the only matching base
 * (and its first size) so the user does not need an extra step.
 */
export function withAutoResolvedBase(
  bases: BasePattern[],
  value: BasePatternCascadeValue
): BasePatternCascadeValue {
  if (value.origin !== "library" || !value.garmentType || !value.houseBrandCode || !value.cutFamily) {
    return value;
  }

  const narrowed = filterBases(bases, {
    houseBrandCode: value.houseBrandCode,
    garmentType: value.garmentType,
    cutFamily: value.cutFamily,
    cutVariant: value.cutVariant,
  });

  if (narrowed.length === 1) {
    const only = narrowed[0]!;
    const size =
      value.baseSize && only.sizes.includes(value.baseSize)
        ? value.baseSize
        : only.sizes[0] ?? "";
    return {
      ...value,
      basePatternId: only.id,
      baseSize: size,
    };
  }

  if (value.basePatternId && !narrowed.some((base) => base.id === value.basePatternId)) {
    return { ...value, basePatternId: "", baseSize: "" };
  }

  const selected = narrowed.find((base) => base.id === value.basePatternId);
  if (selected && value.baseSize && !selected.sizes.includes(value.baseSize)) {
    return { ...value, baseSize: selected.sizes[0] ?? "" };
  }

  return value;
}

export function cascadeSelectionReady(value: BasePatternCascadeValue): boolean {
  if (!value.garmentType.trim()) return false;
  if (value.origin === "custom") return true;
  return Boolean(value.basePatternId && value.baseSize);
}
