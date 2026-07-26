import drapersSwatchIndex from "@/data/suppliers/drapers-swatch-index.json";
import { drapersSwatchImageUrl } from "@/lib/fabric-sourcing/drapers-swatch-url";
import { normalizeDrapersFabricCode } from "@/lib/integrations/drapers/stock";
import type { FabricSwatchUrls } from "@/lib/fabric-sourcing/fabric-swatch-keys";

type SwatchIndexFile = {
  fabrics: Array<{
    fabric_number: string;
    swatch_filename?: string | null;
    swatch_square?: string | null;
    swatch_zoom?: string | null;
  }>;
};

const swatchByCode = new Map<string, FabricSwatchUrls>();

function registerSwatchKeys(fabricNumber: string, urls: FabricSwatchUrls): void {
  const trimmed = fabricNumber.trim();
  const normalized = normalizeDrapersFabricCode(trimmed);
  for (const key of [trimmed, normalized, `DP${normalized}`]) {
    if (key) swatchByCode.set(key, urls);
  }
}

for (const fabric of (drapersSwatchIndex as SwatchIndexFile).fabrics) {
  if (fabric.swatch_filename) {
    const localUrl = drapersSwatchImageUrl(fabric.fabric_number);
    registerSwatchKeys(fabric.fabric_number, { square: localUrl, zoom: localUrl });
    continue;
  }
  if (!fabric.swatch_square) continue;
  registerSwatchKeys(fabric.fabric_number, {
    square: fabric.swatch_square,
    zoom: fabric.swatch_zoom || fabric.swatch_square,
  });
}

export function getDrapersCatalogSwatchUrls(fabricNumber: string): FabricSwatchUrls | undefined {
  const trimmed = fabricNumber.trim();
  if (!trimmed) return undefined;
  const normalized = normalizeDrapersFabricCode(trimmed);
  return (
    swatchByCode.get(trimmed) ??
    swatchByCode.get(normalized) ??
    swatchByCode.get(`DP${normalized}`)
  );
}

export function drapersCatalogSwatchCount(): number {
  return swatchByCode.size;
}
