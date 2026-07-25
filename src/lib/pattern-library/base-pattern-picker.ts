import { parseClientCodeParts } from "@/lib/clients/codes";
import {
  GARMENT_STITCH_TYPES,
  isGarmentStitchType,
} from "@/lib/sales-orders/garment-types";
import type { BasePattern } from "@/lib/types/pattern-library";

/**
 * Garment sheet options for Pattern Library — same list as Sales / Production
 * "garment to stitch", minus Fabric-only (no sheet).
 */
export const PATTERN_SHEET_GARMENTS: string[] = GARMENT_STITCH_TYPES.filter(
  (type) => type !== "Fabric only"
);

/** Owner's preferred browse order inside a family (library base keys, lowercase). */
export const PICKER_GARMENT_ORDER = [
  "suit",
  "jacket",
  "overshirt",
  "overcoat",
  "shirt",
  "polo",
  "t-shirt",
  "vest",
  "trouser",
  "shorts",
  "short",
  "thobe",
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

/** Keep sales stitch labels as-is ("Shirt LS"); only title-case bare library keys. */
export function garmentLabel(garment: string): string {
  if (!garment) return "";
  if (isGarmentStitchType(garment) || /[A-Z]/.test(garment.slice(1))) return garment;
  return garment.charAt(0).toUpperCase() + garment.slice(1);
}

/**
 * Map a sales/pattern sheet garment to library base `garment_type` keys
 * (bases are often lowercase: shirt, shorts, trouser…).
 */
export function libraryGarmentKeysForSheet(garment: string): string[] {
  const trimmed = garment.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const keys = new Set<string>([trimmed, lower]);

  if (lower === "short" || lower === "shorts") {
    keys.add("short");
    keys.add("shorts");
  }
  if (lower.startsWith("shirt") || lower.includes("shirt+")) {
    keys.add("shirt");
  }
  if (lower === "polo") {
    keys.add("polo");
    keys.add("shirt");
  }
  if (lower === "t-shirt" || lower === "tshirt") {
    keys.add("t-shirt");
    keys.add("shirt");
  }
  if (lower.includes("thobe")) {
    keys.add("thobe");
  }
  if (lower.includes("jacket") || lower === "suit") {
    keys.add("jacket");
  }
  if (lower.includes("trouser")) {
    keys.add("trouser");
  }
  if (lower.includes("overshirt")) {
    keys.add("overshirt");
  }
  if (lower.includes("overcoat")) {
    keys.add("overcoat");
  }
  if (lower.includes("vest")) {
    keys.add("vest");
  }
  if (lower === "suit") {
    keys.add("suit");
    keys.add("trouser");
  }

  return [...keys];
}

export function garmentMatchesLibraryBase(sheetGarment: string, baseGarment: string): boolean {
  const allowed = new Set(
    libraryGarmentKeysForSheet(sheetGarment).map((key) => key.toLowerCase())
  );
  return allowed.has(baseGarment.trim().toLowerCase());
}

function stitchRank(garment: string): number {
  const exact = PATTERN_SHEET_GARMENTS.indexOf(garment);
  if (exact >= 0) return exact;
  const ci = PATTERN_SHEET_GARMENTS.findIndex(
    (type) => type.toLowerCase() === garment.trim().toLowerCase()
  );
  if (ci >= 0) return ci;
  const lib = PICKER_GARMENT_ORDER.indexOf(garment.trim().toLowerCase());
  if (lib >= 0) return PATTERN_SHEET_GARMENTS.length + lib;
  return PATTERN_SHEET_GARMENTS.length + PICKER_GARMENT_ORDER.length;
}

export function compareGarments(a: string, b: string): number {
  return stitchRank(a) - stitchRank(b) || a.localeCompare(b);
}

export function filterBases(
  bases: BasePattern[],
  filters: BasePatternCascadeFilters
): BasePattern[] {
  return bases.filter((base) => {
    if (filters.houseBrandCode && base.house_brand_code !== filters.houseBrandCode) {
      return false;
    }
    if (filters.garmentType && !garmentMatchesLibraryBase(filters.garmentType, base.garment_type)) {
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

/**
 * Sheet dropdown: full sales garment list first, then any extra/base-only keys
 * not already represented.
 */
export function uniqueGarmentTypes(bases: BasePattern[], extra: string[] = []): string[] {
  const extras = [...bases.map((base) => base.garment_type), ...extra];
  const covered = new Set(
    PATTERN_SHEET_GARMENTS.flatMap((sheet) =>
      libraryGarmentKeysForSheet(sheet).map((key) => key.toLowerCase())
    )
  );
  const leftovers = extras.filter((garment) => {
    const lower = garment.trim().toLowerCase();
    if (!lower) return false;
    if (PATTERN_SHEET_GARMENTS.some((sheet) => sheet.toLowerCase() === lower)) return false;
    return !covered.has(lower);
  });
  return uniqueSorted([...PATTERN_SHEET_GARMENTS, ...leftovers], compareGarments);
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

/** Canonical garment string for storage (preserve sales stitch labels). */
export function normalizePatternSheetGarment(garment: string): string {
  const trimmed = garment.trim();
  if (!trimmed) return "";
  const stitch = PATTERN_SHEET_GARMENTS.find(
    (type) => type.toLowerCase() === trimmed.toLowerCase()
  );
  return stitch ?? trimmed;
}
