import { createBasePattern } from "@/lib/pattern-library/mutations";
import { readPatternLibraryFresh } from "@/lib/data/pattern-library";
import type { BasePattern } from "@/lib/types/pattern-library";

/** Stock-44 .. Stock-68 on SO-2026-0142 / SO-2026-0150, stored as size numbers. */
export const BOGGI_OVERCOAT_SIZES = [
  "44",
  "46",
  "48",
  "50",
  "52",
  "54",
  "56",
  "58",
  "60",
  "62",
  "64",
  "66",
  "68",
] as const;

/** Same measurement rows as Boggi Jacket so Pattern has a sheet to fill. */
export const BOGGI_OVERCOAT_POINT_NAMES = [
  "Total Length (HNP)",
  "1/2 Chest",
  "1/2 Waist",
  "1/2 Hip Width",
  "1/2 Shoulder",
  "Slv Length",
  "Cuff Opening",
  "CB Length",
] as const;

export function sameBrandFamilyGarment(
  base: Pick<BasePattern, "house_brand_id" | "cut_family" | "garment_type" | "cut_variant">,
  target: {
    house_brand_id: string;
    cut_family: string;
    garment_type: string;
    cut_variant?: string | null;
  }
): boolean {
  return (
    base.house_brand_id === target.house_brand_id &&
    base.cut_family.trim().toLowerCase() === target.cut_family.trim().toLowerCase() &&
    base.garment_type.trim().toLowerCase() === target.garment_type.trim().toLowerCase() &&
    (base.cut_variant ?? "").trim().toLowerCase() === (target.cut_variant ?? "").trim().toLowerCase()
  );
}

export function findBrandFamilyGarment(
  bases: BasePattern[],
  target: {
    house_brand_id: string;
    cut_family: string;
    garment_type: string;
    cut_variant?: string | null;
  }
): BasePattern | null {
  return bases.find((base) => sameBrandFamilyGarment(base, target)) ?? null;
}

export async function ensureReadyMadeBrandBase(input: {
  house_brand_id: string;
  house_brand_code: string;
  cut_family: string;
  garment_type: string;
  name: string;
  sizes: readonly string[];
  point_names: readonly string[];
  unit?: "in" | "cm";
  notes?: string | null;
  createdBy?: string | null;
}): Promise<{ created: boolean; base: BasePattern }> {
  const store = await readPatternLibraryFresh();
  const existing = findBrandFamilyGarment(store.base_patterns, input);
  if (existing) {
    return { created: false, base: existing };
  }

  const created = await createBasePattern(
    {
      house_brand_id: input.house_brand_id,
      house_brand_code: input.house_brand_code,
      cut_family: input.cut_family,
      garment_type: input.garment_type,
      name: input.name,
      unit: input.unit ?? "in",
      sizes: [...input.sizes],
      points: input.point_names.map((name) => ({ name, values: {} })),
      notes: input.notes ?? null,
    },
    { createdBy: input.createdBy ?? "erp" }
  );
  if (!created.ok) {
    throw new Error(created.error);
  }
  return { created: true, base: created.base };
}

export async function ensureBoggiOvercoatBases(createdBy = "erp"): Promise<{
  created: BasePattern[];
  existing: BasePattern[];
}> {
  const notes =
    "Ready-made Boggi Overcoat size run (SO-2026-0142 / SO-2026-0150). One sheet, all sizes. Not a person client.";
  const created: BasePattern[] = [];
  const existing: BasePattern[] = [];

  for (const brand of [
    { house_brand_id: "fouad-rahme", house_brand_code: "FR" },
    { house_brand_id: "gliani", house_brand_code: "GL" },
  ] as const) {
    const result = await ensureReadyMadeBrandBase({
      house_brand_id: brand.house_brand_id,
      house_brand_code: brand.house_brand_code,
      cut_family: "Boggi",
      garment_type: "overcoat",
      name: "Boggi Overcoat",
      sizes: BOGGI_OVERCOAT_SIZES,
      point_names: BOGGI_OVERCOAT_POINT_NAMES,
      notes,
      createdBy,
    });
    if (result.created) created.push(result.base);
    else existing.push(result.base);
  }

  return { created, existing };
}
