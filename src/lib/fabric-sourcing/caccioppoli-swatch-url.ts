import { normalizeCaccioppoliItemCode } from "@/lib/integrations/caccioppoli/availability";

/** Client-safe API route URL for a cached Caccioppoli swatch image. */
export function caccioppoliSwatchImageUrl(fabricNumber: string): string {
  const normalized = normalizeCaccioppoliItemCode(fabricNumber);
  return `/api/suppliers/caccioppoli/images/${encodeURIComponent(normalized)}`;
}
