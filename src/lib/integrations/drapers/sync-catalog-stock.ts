import fs from "fs";
import path from "path";
import {
  fetchAllDrapersStockPages,
  lookupDrapersFabricStock,
} from "@/lib/integrations/drapers/client";
import { isDrapersApiConfigured } from "@/lib/integrations/drapers/config";
import { mapDrapersStockRow, normalizeDrapersFabricCode } from "@/lib/integrations/drapers/stock";
import type { DrapersStockRow } from "@/lib/integrations/drapers/types";

const CATALOG_PATH = path.join(process.cwd(), "src/data/suppliers/drapers-hs-ss26.json");

export interface DrapersStockSyncOptions {
  /** Sync only these fabric codes. When omitted with scope catalog, pulls all pages from API. */
  fabric_numbers?: string[];
  /** Use paginated GET /stock/ instead of per-fabric lookups. */
  mode?: "api_pages" | "lookup";
  page_limit?: number;
}

export interface DrapersStockSyncResult {
  checked: number;
  updated: number;
  in_stock: number;
  unavailable: number;
  not_found: number;
  errors: string[];
  synced_at: string;
  mode: string;
}

type DrapersCatalogFile = {
  fabrics: Array<{
    fabric_number: string;
    stock_status?: string | null;
    restock_date?: string | null;
    stock_updated_at?: string | null;
    disponibilita_meters?: number | null;
  }>;
  stock_synced_at?: string | null;
  stock_sync_source?: string | null;
  [key: string]: unknown;
};

function applyStockRow(
  catalogByCode: Map<string, DrapersCatalogFile["fabrics"][number]>,
  row: DrapersStockRow,
  synced_at: string
): boolean {
  const code = normalizeDrapersFabricCode(row.fabric_code);
  const fabric = catalogByCode.get(code) ?? catalogByCode.get(row.fabric_code);
  if (!fabric) return false;

  const mapped = mapDrapersStockRow(row);
  fabric.stock_status = mapped.stock_status;
  fabric.restock_date = mapped.restock_date;
  fabric.disponibilita_meters = mapped.quantity_meters;
  fabric.stock_updated_at = synced_at;
  return true;
}

export async function syncDrapersCatalogStock(
  options: DrapersStockSyncOptions = {}
): Promise<DrapersStockSyncResult> {
  if (!isDrapersApiConfigured()) {
    throw new Error("DRAPERS_API_KEY is not set in .env.local.");
  }

  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8")) as DrapersCatalogFile;
  const synced_at = new Date().toISOString();
  const mode = options.mode ?? (options.fabric_numbers?.length ? "lookup" : "api_pages");

  const result: DrapersStockSyncResult = {
    checked: 0,
    updated: 0,
    in_stock: 0,
    unavailable: 0,
    not_found: 0,
    errors: [],
    synced_at,
    mode,
  };

  const catalogByCode = new Map<string, DrapersCatalogFile["fabrics"][number]>();
  for (const fabric of raw.fabrics) {
    catalogByCode.set(normalizeDrapersFabricCode(fabric.fabric_number), fabric);
    catalogByCode.set(fabric.fabric_number.trim(), fabric);
  }

  if (mode === "lookup" && options.fabric_numbers?.length) {
    for (const fabricNumber of options.fabric_numbers) {
      result.checked += 1;
      const lookup = await lookupDrapersFabricStock(fabricNumber);
      if (!lookup.ok) {
        result.not_found += 1;
        result.errors.push(`${fabricNumber}: ${lookup.error}`);
        continue;
      }

      const updated = applyStockRow(
        catalogByCode,
        {
          fabric_code: lookup.fabric_code,
          quantity: String(lookup.quantity_meters),
          in_stock: lookup.in_stock,
          in_restock: lookup.in_restock,
          restock_date: lookup.restock_date,
        },
        synced_at
      );

      if (updated) {
        result.updated += 1;
        if (lookup.stock_status === "in_stock") result.in_stock += 1;
        else result.unavailable += 1;
      } else {
        result.not_found += 1;
      }
    }
  } else {
    const apiRows = await fetchAllDrapersStockPages({
      pageLimit: options.page_limit ?? 200,
      onPage: () => undefined,
    });

    result.checked = apiRows.length;
    const seen = new Set<string>();

    for (const row of apiRows) {
      seen.add(row.fabric_code);
      if (applyStockRow(catalogByCode, row, synced_at)) {
        result.updated += 1;
        const mapped = mapDrapersStockRow(row);
        if (mapped.stock_status === "in_stock") result.in_stock += 1;
        else result.unavailable += 1;
      }
    }

    if (options.fabric_numbers?.length) {
      for (const code of options.fabric_numbers) {
        const normalized = normalizeDrapersFabricCode(code);
        if (!seen.has(normalized) && !seen.has(code)) {
          result.not_found += 1;
        }
      }
    }
  }

  raw.stock_synced_at = synced_at;
  raw.stock_sync_source = "api.drapersitaly.it/stock";
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
    if (order.status === "complete") continue;
    for (const line of order.fabric_lines) {
      if (line.supplier_id === "drapers") {
        numbers.add(line.fabric_number.trim());
      }
    }
  }
  return [...numbers].sort();
}
