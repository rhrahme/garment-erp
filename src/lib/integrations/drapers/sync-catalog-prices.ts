import fs from "fs";
import path from "path";
import { fetchAllDrapersAccountPricelistPages } from "@/lib/integrations/drapers/client";
import { isDrapersApiConfigured } from "@/lib/integrations/drapers/config";
import { normalizeDrapersFabricCode, parseDrapersDecimal } from "@/lib/integrations/drapers/stock";
import type { DrapersPricelistRow } from "@/lib/integrations/drapers/types";

const CATALOG_PATH = path.join(process.cwd(), "src/data/suppliers/drapers-hs-ss26.json");

export interface DrapersPriceSyncResult {
  checked: number;
  updated: number;
  unchanged: number;
  not_in_catalog: number;
  synced_at: string;
}

type DrapersCatalogFile = {
  fabrics: Array<{
    fabric_number: string;
    unit_price?: number | null;
    list_price?: number | null;
    price_updated_at?: string | null;
    [key: string]: unknown;
  }>;
  price_synced_at?: string | null;
  price_sync_source?: string | null;
  [key: string]: unknown;
};

function applyPriceRow(
  catalogByCode: Map<string, DrapersCatalogFile["fabrics"][number]>,
  row: DrapersPricelistRow,
  synced_at: string
): "updated" | "unchanged" | "missing" {
  const code = normalizeDrapersFabricCode(row.fabric_code);
  const fabric = catalogByCode.get(code) ?? catalogByCode.get(row.fabric_code);
  if (!fabric) return "missing";

  const actual = parseDrapersDecimal(row.actual_price);
  const list = parseDrapersDecimal(row.list_price);
  const prevActual = fabric.unit_price ?? null;
  const prevList = fabric.list_price ?? null;

  fabric.unit_price = actual;
  fabric.list_price = list;
  fabric.price_updated_at = synced_at;

  if (prevActual === actual && prevList === list) return "unchanged";
  return "updated";
}

export async function syncDrapersCatalogPrices(options?: {
  page_limit?: number;
}): Promise<DrapersPriceSyncResult> {
  if (!isDrapersApiConfigured()) {
    throw new Error("DRAPERS_API_KEY is not set in .env.local.");
  }

  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as DrapersCatalogFile;
  const synced_at = new Date().toISOString();

  const result: DrapersPriceSyncResult = {
    checked: 0,
    updated: 0,
    unchanged: 0,
    not_in_catalog: 0,
    synced_at,
  };

  const catalogByCode = new Map<string, DrapersCatalogFile["fabrics"][number]>();
  for (const fabric of raw.fabrics) {
    catalogByCode.set(normalizeDrapersFabricCode(fabric.fabric_number), fabric);
    catalogByCode.set(fabric.fabric_number.trim(), fabric);
  }

  const apiRows = await fetchAllDrapersAccountPricelistPages({
    pageLimit: options?.page_limit ?? 200,
  });

  result.checked = apiRows.length;

  for (const row of apiRows) {
    const outcome = applyPriceRow(catalogByCode, row, synced_at);
    if (outcome === "updated") result.updated += 1;
    else if (outcome === "unchanged") result.unchanged += 1;
    else result.not_in_catalog += 1;
  }

  raw.price_synced_at = synced_at;
  raw.price_sync_source = "api.drapersitaly.it/pricelist/account";
  fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  return result;
}
