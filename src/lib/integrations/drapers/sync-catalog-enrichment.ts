import fs from "fs";
import path from "path";
import {
  fetchAllDrapersAccountPricelistPages,
  fetchAllDrapersFabricPages,
  fetchAllDrapersStockPages,
  fetchDrapersFabricDetail,
  lookupDrapersFabricMedias,
} from "@/lib/integrations/drapers/client";
import { isDrapersApiConfigured } from "@/lib/integrations/drapers/config";
import {
  applyDrapersDetailToCatalogFabric,
  applyDrapersListRowToCatalogFabric,
  applyDrapersMediasToCatalogFabric,
  applyDrapersPriceToCatalogFabric,
  applyDrapersStockToCatalogFabric,
  findDrapersCatalogFabric,
  indexDrapersCatalogFabrics,
  type DrapersCatalogFile,
} from "@/lib/integrations/drapers/catalog-fields";
import { normalizeDrapersFabricCode } from "@/lib/integrations/drapers/stock";

const CATALOG_PATH = path.join(process.cwd(), "src/data/suppliers/drapers-hs-ss26.json");

export interface DrapersCatalogSyncOptions {
  /** When set, only enrich detail + medias for these codes. */
  fabric_numbers?: string[];
  /** Enrich every fabric in the local catalog (specs + remote swatch URLs). */
  enrich_all?: boolean;
  /** Fetch GET /fabrics/{code}/ and /medias/ — default when targets exist. */
  enrich_details?: boolean;
  /** Include live stock/availability in this run (default false — use sync-catalog-stock for that). */
  include_availability?: boolean;
  /** Include account prices (default true for cache refresh). */
  include_prices?: boolean;
  /** Pause between per-fabric detail/media calls (ms). */
  delay_ms?: number;
  page_limit?: number;
}

export interface DrapersCatalogSyncResult {
  list_checked: number;
  list_updated: number;
  stock_checked: number;
  stock_updated: number;
  prices_checked: number;
  prices_updated: number;
  prices_unchanged: number;
  prices_not_in_catalog: number;
  details_checked: number;
  details_updated: number;
  medias_updated: number;
  not_in_catalog: number;
  errors: string[];
  synced_at: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cache Drapers specs + remote swatch URLs into drapers-hs-ss26.json. Availability is optional. */
export async function syncDrapersCatalogFromApi(
  options: DrapersCatalogSyncOptions = {}
): Promise<DrapersCatalogSyncResult> {
  if (!isDrapersApiConfigured()) {
    throw new Error("DRAPERS_API_KEY is not set in .env.local.");
  }

  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as DrapersCatalogFile;
  const synced_at = new Date().toISOString();
  const catalogByCode = indexDrapersCatalogFabrics(raw.fabrics);
  const pageLimit = options.page_limit ?? 500;
  const delayMs = options.delay_ms ?? 150;
  const includeAvailability = options.include_availability ?? false;
  const includePrices = options.include_prices ?? true;

  const result: DrapersCatalogSyncResult = {
    list_checked: 0,
    list_updated: 0,
    stock_checked: 0,
    stock_updated: 0,
    prices_checked: 0,
    prices_updated: 0,
    prices_unchanged: 0,
    prices_not_in_catalog: 0,
    details_checked: 0,
    details_updated: 0,
    medias_updated: 0,
    not_in_catalog: 0,
    errors: [],
    synced_at,
  };

  const listRows = await fetchAllDrapersFabricPages({ pageLimit });
  result.list_checked = listRows.length;
  for (const row of listRows) {
    const fabric = findDrapersCatalogFabric(catalogByCode, row.fabric_code);
    if (!fabric) {
      result.not_in_catalog += 1;
      continue;
    }
    applyDrapersListRowToCatalogFabric(fabric, row, synced_at);
    result.list_updated += 1;
  }

  if (includeAvailability) {
    const stockRows = await fetchAllDrapersStockPages({ pageLimit });
    result.stock_checked = stockRows.length;
    for (const row of stockRows) {
      const fabric = findDrapersCatalogFabric(catalogByCode, row.fabric_code);
      if (!fabric) continue;
      if (applyDrapersStockToCatalogFabric(fabric, row, synced_at)) {
        result.stock_updated += 1;
      }
    }
    raw.stock_synced_at = synced_at;
    raw.stock_sync_source = "api.drapersitaly.it/stock";
  }

  if (includePrices) {
    const priceRows = await fetchAllDrapersAccountPricelistPages({ pageLimit });
    result.prices_checked = priceRows.length;
    for (const row of priceRows) {
      const fabric = findDrapersCatalogFabric(catalogByCode, row.fabric_code);
      if (!fabric) {
        result.prices_not_in_catalog += 1;
        continue;
      }
      const outcome = applyDrapersPriceToCatalogFabric(fabric, row, synced_at);
      if (outcome === "updated") result.prices_updated += 1;
      else result.prices_unchanged += 1;
    }
    raw.price_synced_at = synced_at;
    raw.price_sync_source = "api.drapersitaly.it/pricelist/account";
  }

  const detailTargets = options.enrich_all
    ? raw.fabrics.map((fabric) => fabric.fabric_number)
    : (options.fabric_numbers?.map((n) => normalizeDrapersFabricCode(n)).filter(Boolean) ?? []);

  const enrichDetails =
    options.enrich_details ?? (options.enrich_all || Boolean(detailTargets.length));

  if (enrichDetails && detailTargets.length > 0) {
    for (const fabricNumber of detailTargets) {
      result.details_checked += 1;
      const fabric = findDrapersCatalogFabric(catalogByCode, fabricNumber);
      if (!fabric) {
        result.errors.push(`${fabricNumber}: not in local catalog`);
        continue;
      }

      try {
        const detail = await fetchDrapersFabricDetail(fabricNumber);
        if (detail) {
          applyDrapersDetailToCatalogFabric(fabric, detail, synced_at);
          result.details_updated += 1;
        } else {
          result.errors.push(`${fabricNumber}: fabric detail not found`);
        }

        const medias = await lookupDrapersFabricMedias(fabricNumber);
        if (medias.ok && medias.medias) {
          applyDrapersMediasToCatalogFabric(fabric, medias.medias, synced_at);
          result.medias_updated += 1;
        } else if (!medias.ok) {
          result.errors.push(`${fabricNumber}: ${medias.error}`);
        }
      } catch (error) {
        result.errors.push(
          `${fabricNumber}: ${error instanceof Error ? error.message : "detail sync failed"}`
        );
      }

      if (delayMs > 0) await sleep(delayMs);
    }
  }

  raw.api_catalog_synced_at = synced_at;
  raw.api_catalog_sync_source = "api.drapersitaly.it/fabrics";
  fs.writeFileSync(CATALOG_PATH, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  return result;
}

export function drapersFabricNumbersFromOpenOrders(): string[] {
  const ordersPath = path.join(process.cwd(), "src/data/sales-orders.json");
  const orders = JSON.parse(fs.readFileSync(ordersPath, "utf8")) as {
    orders: Array<{ status: string; fabric_lines: Array<{ supplier_id: string; fabric_number: string }> }>;
  };

  const numbers = new Set<string>();
  for (const order of orders.orders) {
    if (order.status === "complete" || order.status === "superseded") continue;
    for (const line of order.fabric_lines) {
      if (line.supplier_id !== "drapers") continue;
      const code = line.fabric_number.trim();
      if (!code || code === "DP") continue;
      numbers.add(code);
    }
  }
  return [...numbers].sort();
}
