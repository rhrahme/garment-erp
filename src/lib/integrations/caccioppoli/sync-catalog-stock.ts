import fs from "fs";
import path from "path";
import {
  buildCaccioppoliAvailabilityMap,
  fetchCaccioppoliAvailabilityAll,
  lookupCaccioppoliAvailability,
} from "@/lib/integrations/caccioppoli/client";
import { isCaccioppoliApiConfigured } from "@/lib/integrations/caccioppoli/config";
import {
  caccioppoliItemCandidates,
  mapCaccioppoliAvailabilityRow,
  normalizeCaccioppoliItemCode,
} from "@/lib/integrations/caccioppoli/availability";
import type { CaccioppoliAvailabilityRow } from "@/lib/integrations/caccioppoli/types";

const CATALOG_PATHS = [
  path.join(process.cwd(), "src/data/suppliers/caccioppoli-jackets-ss26.json"),
  path.join(process.cwd(), "src/data/suppliers/caccioppoli-shirting-ss26.json"),
];

export interface CaccioppoliStockSyncOptions {
  fabric_numbers?: string[];
  mode?: "availability_all" | "lookup";
}

export interface CaccioppoliStockSyncResult {
  checked: number;
  updated: number;
  in_stock: number;
  unavailable: number;
  not_found: number;
  errors: string[];
  synced_at: string;
  mode: string;
  catalogs: string[];
}

type CaccioppoliCatalogFile = {
  fabrics: Array<{
    fabric_number: string;
    stock_status?: string | null;
    restock_date?: string | null;
    stock_updated_at?: string | null;
  }>;
  stock_synced_at?: string | null;
  stock_sync_source?: string | null;
  [key: string]: unknown;
};

function applyAvailabilityRow(
  fabric: CaccioppoliCatalogFile["fabrics"][number],
  row: CaccioppoliAvailabilityRow,
  synced_at: string
): boolean {
  const mapped = mapCaccioppoliAvailabilityRow(row);
  if (mapped.not_found) return false;

  fabric.stock_status = mapped.stock_status;
  fabric.restock_date = mapped.restock_date;
  fabric.stock_updated_at = synced_at;
  return true;
}

function loadCatalogs(): Array<{ path: string; raw: CaccioppoliCatalogFile }> {
  return CATALOG_PATHS.map((catalogPath) => ({
    path: catalogPath,
    raw: JSON.parse(fs.readFileSync(catalogPath, "utf8")) as CaccioppoliCatalogFile,
  }));
}

export async function syncCaccioppoliCatalogStock(
  options: CaccioppoliStockSyncOptions = {}
): Promise<CaccioppoliStockSyncResult> {
  if (!isCaccioppoliApiConfigured()) {
    throw new Error("CACCIOPPOLI_API_TOKEN is not set in .env.local.");
  }

  const synced_at = new Date().toISOString();
  const mode = options.mode ?? (options.fabric_numbers?.length ? "lookup" : "availability_all");
  const catalogs = loadCatalogs();

  const result: CaccioppoliStockSyncResult = {
    checked: 0,
    updated: 0,
    in_stock: 0,
    unavailable: 0,
    not_found: 0,
    errors: [],
    synced_at,
    mode,
    catalogs: catalogs.map((c) => path.basename(c.path)),
  };

  const fabricByCode = new Map<string, CaccioppoliCatalogFile["fabrics"][number]>();
  for (const { raw } of catalogs) {
    for (const fabric of raw.fabrics) {
      const normalized = normalizeCaccioppoliItemCode(fabric.fabric_number);
      fabricByCode.set(normalized, fabric);
      fabricByCode.set(fabric.fabric_number.trim(), fabric);
    }
  }

  const targetNumbers =
    options.fabric_numbers?.map((n) => n.trim()).filter(Boolean) ??
    [...new Set([...fabricByCode.keys()].filter((k) => /^\d{4,}$/.test(k)))];

  if (mode === "lookup") {
    for (const fabricNumber of targetNumbers) {
      result.checked += 1;
      const fabric = fabricByCode.get(normalizeCaccioppoliItemCode(fabricNumber));
      if (!fabric) {
        result.not_found += 1;
        continue;
      }

      const lookup = await lookupCaccioppoliAvailability(fabricNumber);
      if (!lookup.ok) {
        result.not_found += 1;
        if (!lookup.not_found) result.errors.push(`${fabricNumber}: ${lookup.error}`);
        continue;
      }

      const updated = applyAvailabilityRow(
        fabric,
        { item: lookup.item, stato: lookup.stato, info: lookup.info },
        synced_at
      );
      if (updated) {
        result.updated += 1;
        if (lookup.stock_status === "in_stock") result.in_stock += 1;
        else result.unavailable += 1;
      }
    }
  } else {
    const apiRows = await fetchCaccioppoliAvailabilityAll();
    const availabilityMap = buildCaccioppoliAvailabilityMap(apiRows);
    const seen = new Set<string>();

    for (const fabricNumber of targetNumbers) {
      result.checked += 1;
      const fabric = fabricByCode.get(normalizeCaccioppoliItemCode(fabricNumber));
      if (!fabric) continue;

      let row: CaccioppoliAvailabilityRow | undefined;
      for (const candidate of caccioppoliItemCandidates(fabricNumber)) {
        row = availabilityMap.get(candidate);
        if (row) break;
      }

      if (!row) {
        result.not_found += 1;
        continue;
      }

      seen.add(row.item);
      const updated = applyAvailabilityRow(fabric, row, synced_at);
      if (updated) {
        result.updated += 1;
        const mapped = mapCaccioppoliAvailabilityRow(row);
        if (mapped.stock_status === "in_stock") result.in_stock += 1;
        else result.unavailable += 1;
      }
    }
  }

  for (const catalog of catalogs) {
    catalog.raw.stock_synced_at = synced_at;
    catalog.raw.stock_sync_source = "api-service.grsis.it/caccioppoli/cc_availability";
    fs.writeFileSync(catalog.path, `${JSON.stringify(catalog.raw, null, 2)}\n`, "utf8");
  }

  return result;
}

export function caccioppoliFabricNumbersFromOpenOrders(): string[] {
  const ordersPath = path.join(process.cwd(), "src/data/sales-orders.json");
  const orders = JSON.parse(fs.readFileSync(ordersPath, "utf8")) as {
    orders: Array<{ status: string; fabric_lines: Array<{ supplier_id: string; fabric_number: string }> }>;
  };

  const numbers = new Set<string>();
  for (const order of orders.orders) {
    if (order.status === "complete") continue;
    for (const line of order.fabric_lines) {
      if (line.supplier_id === "caccioppoli") {
        numbers.add(line.fabric_number.trim());
      }
    }
  }
  return [...numbers].sort();
}
