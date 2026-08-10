import swatchColorsDoc from "@/data/suppliers/loro-piana-swatch-colors.json";
import { normalizeLoroPianaFabricNumber } from "@/lib/fabric-sourcing/loro-piana-styles";

type SwatchColorEntry = { color: string; hex: string };

type SwatchColorsFile = {
  colors?: Record<string, SwatchColorEntry>;
};

const COLORS: Record<string, SwatchColorEntry> =
  (swatchColorsDoc as SwatchColorsFile).colors ?? {};

/** Approximate color name extracted from the local LP/Solbiati swatch JPEG. */
export function loroPianaSwatchColorName(fabricNumber: string | null | undefined): string | null {
  const key = normalizeLoroPianaFabricNumber(fabricNumber ?? "").trim();
  if (!key) return null;
  const entry = COLORS[key] ?? COLORS[key.toUpperCase()] ?? COLORS[key.toLowerCase()];
  const name = entry?.color?.trim();
  return name || null;
}

/** Dominant hex from the swatch crop (for chips / debug). */
export function loroPianaSwatchColorHex(fabricNumber: string | null | undefined): string | null {
  const key = normalizeLoroPianaFabricNumber(fabricNumber ?? "").trim();
  if (!key) return null;
  const entry = COLORS[key] ?? COLORS[key.toUpperCase()] ?? COLORS[key.toLowerCase()];
  const hex = entry?.hex?.trim();
  return hex || null;
}

/**
 * Prefer an explicit catalog/line color; otherwise use swatch-derived label.
 */
export function resolveLoroPianaDisplayColor(
  fabricNumber: string | null | undefined,
  explicitColor: string | null | undefined
): string | null {
  const explicit = explicitColor?.trim() || null;
  if (explicit) return explicit;
  return loroPianaSwatchColorName(fabricNumber);
}
