/** Stable pastel Tailwind classes for stitch floor garment recognition. */

export type GarmentTypeColorKey =
  | "jacket"
  | "trouser"
  | "vest"
  | "short"
  | "shirt"
  | "polo"
  | "tshirt"
  | "overshirt"
  | "overcoat"
  | "thobe"
  | "boxer"
  | "suit";

export type GarmentTypeColorClasses = {
  key: GarmentTypeColorKey | "unknown";
  label: string;
  bg: string;
  text: string;
  /** Combined chip classes: bg + text */
  chip: string;
};

const COLOR_BY_KEY: Record<
  GarmentTypeColorKey,
  { label: string; bg: string; text: string }
> = {
  jacket: { label: "Jacket", bg: "bg-amber-100", text: "text-amber-950" },
  trouser: { label: "Trouser", bg: "bg-sky-100", text: "text-sky-950" },
  vest: { label: "Vest", bg: "bg-violet-100", text: "text-violet-950" },
  short: { label: "Short", bg: "bg-teal-100", text: "text-teal-950" },
  shirt: { label: "Shirt", bg: "bg-blue-100", text: "text-blue-950" },
  polo: { label: "Polo", bg: "bg-cyan-100", text: "text-cyan-950" },
  tshirt: { label: "T-shirt", bg: "bg-lime-100", text: "text-lime-950" },
  overshirt: { label: "Overshirt", bg: "bg-orange-100", text: "text-orange-950" },
  overcoat: { label: "Overcoat", bg: "bg-stone-200", text: "text-stone-900" },
  thobe: { label: "Thobe", bg: "bg-emerald-100", text: "text-emerald-950" },
  boxer: { label: "Boxer", bg: "bg-rose-100", text: "text-rose-950" },
  suit: { label: "Suit", bg: "bg-indigo-100", text: "text-indigo-950" },
};

const UNKNOWN: GarmentTypeColorClasses = {
  key: "unknown",
  label: "Other",
  bg: "bg-slate-100",
  text: "text-slate-700",
  chip: "bg-slate-100 text-slate-700",
};

/** Legend swatches shown on Live / Orders (main floor types). */
export const GARMENT_TYPE_COLOR_LEGEND: GarmentTypeColorKey[] = [
  "overshirt",
  "trouser",
  "jacket",
  "shirt",
  "vest",
  "short",
  "polo",
  "tshirt",
  "overcoat",
  "thobe",
];

/**
 * Normalize article / garment / piece label to a color key.
 * Prefers specific piece tokens (overshirt before shirt, overcoat before coat).
 */
export function normalizeGarmentTypeColorKey(
  value: string | null | undefined
): GarmentTypeColorKey | null {
  if (!value?.trim()) return null;
  const s = value
    .trim()
    .toLowerCase()
    .replace(/[_/+,]+/g, " ")
    .replace(/\s+/g, " ");

  if (/\bovershirt\b/.test(s)) return "overshirt";
  if (/\bovercoat\b/.test(s)) return "overcoat";
  if (/\bt[\s-]?shirt\b/.test(s) || /\btshirt\b/.test(s)) return "tshirt";
  if (/\bpolo\b/.test(s)) return "polo";
  if (/\bshirt\b/.test(s)) return "shirt";
  if (/\btrouser/.test(s) || /\bserwal\b/.test(s) || /\bsirwal\b/.test(s) || /\bsalwar\b/.test(s)) {
    return "trouser";
  }
  if (/\bshort/.test(s)) return "short";
  if (/\bjacket\b/.test(s)) return "jacket";
  if (/\bvest\b/.test(s)) return "vest";
  if (/\bthobe\b/.test(s)) return "thobe";
  if (/\bboxer\b/.test(s)) return "boxer";
  if (/\bsuit\b/.test(s)) return "suit";
  return null;
}

export function garmentTypeColorClasses(
  articleOrGarment: string | null | undefined
): GarmentTypeColorClasses {
  const key = normalizeGarmentTypeColorKey(articleOrGarment);
  if (!key) return UNKNOWN;
  const entry = COLOR_BY_KEY[key];
  return {
    key,
    label: entry.label,
    bg: entry.bg,
    text: entry.text,
    chip: `${entry.bg} ${entry.text}`,
  };
}

export function garmentTypeLegendEntry(key: GarmentTypeColorKey): GarmentTypeColorClasses {
  const entry = COLOR_BY_KEY[key];
  return {
    key,
    label: entry.label,
    bg: entry.bg,
    text: entry.text,
    chip: `${entry.bg} ${entry.text}`,
  };
}
