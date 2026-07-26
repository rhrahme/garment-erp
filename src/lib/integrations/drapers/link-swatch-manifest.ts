import fs from "fs";
import path from "path";
import {
  indexDrapersCatalogFabrics,
  type DrapersCatalogFile,
} from "@/lib/integrations/drapers/catalog-fields";
import { normalizeDrapersFabricCode } from "@/lib/integrations/drapers/stock";
import {
  DRAPERS_MANIFEST_PATH,
  readDrapersSwatchManifest,
} from "@/lib/fabric-sourcing/drapers-swatches";

const CATALOG_PATH = path.join(process.cwd(), "src/data/suppliers/drapers-hs-ss26.json");

export interface LinkDrapersSwatchManifestResult {
  linked: number;
  unchanged: number;
  manifest_ok: number;
  synced_at: string;
}

export function linkDrapersSwatchManifestToCatalog(): LinkDrapersSwatchManifestResult {
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as DrapersCatalogFile;
  const synced_at = new Date().toISOString();
  const catalogByCode = indexDrapersCatalogFabrics(raw.fabrics);
  const manifest = readDrapersSwatchManifest();

  const result: LinkDrapersSwatchManifestResult = {
    linked: 0,
    unchanged: 0,
    manifest_ok: manifest.items.filter((item) => item.ok && item.filename).length,
    synced_at,
  };

  for (const item of manifest.items) {
    if (!item.ok || !item.filename) continue;
    const code = normalizeDrapersFabricCode(item.fabric_number);
    const fabric = catalogByCode.get(code) ?? catalogByCode.get(item.fabric_number);
    if (!fabric) continue;

    const prev = fabric.swatch_filename ?? null;
    fabric.swatch_filename = item.filename;
    fabric.swatch_cached_at = synced_at;
    if (prev === item.filename) result.unchanged += 1;
    else result.linked += 1;
  }

  raw.swatch_manifest_path = path.relative(process.cwd(), DRAPERS_MANIFEST_PATH);
  raw.swatch_linked_at = synced_at;
  fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  return result;
}
