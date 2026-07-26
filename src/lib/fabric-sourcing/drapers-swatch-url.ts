import { normalizeDrapersFabricCode } from "@/lib/integrations/drapers/stock";

/** Client-safe API route URL for a cached Drapers swatch image. */
export function drapersSwatchImageUrl(fabricNumber: string): string {
  const normalized = normalizeDrapersFabricCode(fabricNumber);
  return `/api/suppliers/drapers/images/${encodeURIComponent(normalized)}`;
}
