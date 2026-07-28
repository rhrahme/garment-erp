import { normalizeLoroPianaFabricNumber } from "@/lib/fabric-sourcing/loro-piana-styles";

/** Client-safe API route URL for a cached Loro Piana / Solbiati swatch image. */
export function loroPianaSwatchImageUrl(fabricNumber: string): string {
  const normalized = normalizeLoroPianaFabricNumber(fabricNumber);
  return `/api/suppliers/loro-piana/images/${encodeURIComponent(normalized)}`;
}
