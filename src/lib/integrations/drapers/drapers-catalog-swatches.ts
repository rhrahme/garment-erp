import drapersCatalog from "@/data/suppliers/drapers-hs-ss26.json";
import {
  drapersCatalogDisplayFields,
  type DrapersCatalogFabricRow,
} from "@/lib/integrations/drapers/catalog-fields";
import { drapersSwatchImageUrl } from "@/lib/fabric-sourcing/drapers-swatches";
import { normalizeDrapersFabricCode } from "@/lib/integrations/drapers/stock";
import type { FabricSwatchUrls } from "@/lib/fabric-sourcing/fabric-swatch-keys";

type CatalogFile = {
  fabrics: DrapersCatalogFabricRow[];
};

const swatchByCode = new Map<string, FabricSwatchUrls>();

function registerSwatchKeys(fabricNumber: string, urls: FabricSwatchUrls): void {
  const trimmed = fabricNumber.trim();
  const normalized = normalizeDrapersFabricCode(trimmed);
  for (const key of [trimmed, normalized, `DP${normalized}`]) {
    if (key) swatchByCode.set(key, urls);
  }
}

for (const fabric of (drapersCatalog as CatalogFile).fabrics) {
  const display = drapersCatalogDisplayFields(fabric);
  if (display.swatch_filename) {
    const localUrl = drapersSwatchImageUrl(fabric.fabric_number);
    registerSwatchKeys(fabric.fabric_number, { square: localUrl, zoom: localUrl });
    continue;
  }
  if (!display.swatch_square) continue;
  registerSwatchKeys(fabric.fabric_number, {
    square: display.swatch_square,
    zoom: display.swatch_zoom || display.swatch_square,
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
