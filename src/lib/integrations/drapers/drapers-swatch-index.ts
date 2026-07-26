import fs from "node:fs";
import path from "node:path";
import type { DrapersCatalogFabricRow, DrapersCatalogFile } from "@/lib/integrations/drapers/catalog-fields";

/** Client-safe swatch lookup — no unit_price / list_price fields. */
export interface DrapersSwatchIndexRow {
  fabric_number: string;
  swatch_filename?: string | null;
  swatch_square?: string | null;
  swatch_zoom?: string | null;
}

export interface DrapersSwatchIndexFile {
  updated_at: string;
  fabrics: DrapersSwatchIndexRow[];
}

export const DRAPERS_SWATCH_INDEX_PATH = path.join(
  process.cwd(),
  "src/data/suppliers/drapers-swatch-index.json"
);

export function buildDrapersSwatchIndexRows(
  fabrics: DrapersCatalogFabricRow[]
): DrapersSwatchIndexRow[] {
  const rows: DrapersSwatchIndexRow[] = [];
  for (const fabric of fabrics) {
    const swatch_filename = fabric.swatch_filename?.trim() || null;
    const swatch_square = fabric.swatch_square?.trim() || null;
    const swatch_zoom = fabric.swatch_zoom?.trim() || null;
    if (!swatch_filename && !swatch_square) continue;
    rows.push({
      fabric_number: fabric.fabric_number,
      ...(swatch_filename ? { swatch_filename } : {}),
      ...(swatch_square ? { swatch_square } : {}),
      ...(swatch_zoom ? { swatch_zoom } : {}),
    });
  }
  return rows;
}

export function writeDrapersSwatchIndexFromCatalogFile(
  catalog: DrapersCatalogFile,
  syncedAt = new Date().toISOString()
): DrapersSwatchIndexFile {
  const payload: DrapersSwatchIndexFile = {
    updated_at: syncedAt,
    fabrics: buildDrapersSwatchIndexRows(catalog.fabrics),
  };
  fs.writeFileSync(DRAPERS_SWATCH_INDEX_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

export function writeDrapersSwatchIndexFromCatalogPath(
  catalogPath = path.join(process.cwd(), "src/data/suppliers/drapers-hs-ss26.json")
): DrapersSwatchIndexFile {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as DrapersCatalogFile;
  return writeDrapersSwatchIndexFromCatalogFile(catalog);
}
