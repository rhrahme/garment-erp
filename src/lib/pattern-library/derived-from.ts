import type { BasePattern } from "@/lib/types/pattern-library";

/** Client pattern built from scratch (no library base). */
export const CUSTOM_PATTERN_ORIGIN = "Custom";

export type BasePatternDisplaySource = Pick<
  BasePattern,
  "house_brand_code" | "cut_family" | "garment_type" | "cut_variant"
>;

/** e.g. "FR · Suit Supply · Shirt · Regular" */
export function formatBasePatternDisplayName(
  base: BasePatternDisplaySource | null | undefined
): string | null {
  if (!base) return null;
  const garment = base.garment_type
    ? base.garment_type.charAt(0).toUpperCase() + base.garment_type.slice(1)
    : null;
  const bits = [base.house_brand_code, base.cut_family, garment, base.cut_variant].filter(
    (bit): bit is string => Boolean(bit)
  );
  return bits.length > 0 ? bits.join(" · ") : null;
}

/**
 * Tablet-readable size + derivation line for .TUD viewers.
 * e.g. "Size 2XL · from FR · Massimo · Shorts" or "Size 2XL · Custom"
 */
export function formatTudSizeDerivedLine(
  sizes: string[],
  baseDisplayName: string | null | undefined
): string {
  const sizePart =
    sizes.length === 0
      ? null
      : sizes.length === 1
        ? `Size ${sizes[0]}`
        : `Sizes ${sizes.join(", ")}`;
  if (baseDisplayName) {
    return sizePart ? `${sizePart} · from ${baseDisplayName}` : `Derived from: ${baseDisplayName}`;
  }
  if (sizePart) return `${sizePart} · ${CUSTOM_PATTERN_ORIGIN}`;
  return CUSTOM_PATTERN_ORIGIN;
}
