import { normalizeDrapersFabricCode, parseDrapersDecimal } from "@/lib/integrations/drapers/stock";
import type {
  DrapersFabricDetail,
  DrapersFabricListRow,
  DrapersFabricMedias,
  DrapersPricelistRow,
  DrapersStockRow,
} from "@/lib/integrations/drapers/types";
import { mapDrapersStockRow } from "@/lib/integrations/drapers/stock";

/** Raw fabric row in src/data/suppliers/drapers-hs-ss26.json — PDF import + API enrichment. */
export interface DrapersCatalogFabricRow {
  fabric_number: string;
  book_number?: string | null;
  collection?: string | null;
  composition?: string | null;
  mill_code?: string | null;
  mill_name?: string | null;
  gn_code?: string | null;
  width_cm?: number | null;
  weight_linear?: string | null;
  weight_gsm?: number | null;
  color?: string | null;
  description?: string | null;
  category?: string | null;
  unit_price?: number | null;
  list_price?: number | null;
  unit?: string;
  currency?: string;
  is_active?: boolean;
  stock_status?: string | null;
  restock_date?: string | null;
  stock_updated_at?: string | null;
  price_updated_at?: string | null;
  disponibilita_meters?: number | null;
  /** GET /fabrics/{code}/ — brand (mill). */
  api_brand?: string | null;
  /** GET /fabrics/{code}/ — bunch / collection name. */
  api_bunch?: string | null;
  /** GET /fabrics/{code}/ — fibre description. */
  api_fibres?: string | null;
  /** GET /fabrics/{code}/ and list row — catalog availability flag. */
  api_is_available?: boolean | null;
  /** GET /fabrics/ list — warehouse out-of-stock flag. */
  api_is_out_of_stock?: boolean | null;
  /** GET /fabrics/{code}/medias/ */
  swatch_square?: string | null;
  swatch_zoom?: string | null;
  swatch_ruler?: string | null;
  api_detail_updated_at?: string | null;
  api_medias_updated_at?: string | null;
  [key: string]: unknown;
}

export interface DrapersCatalogFile {
  fabrics: DrapersCatalogFabricRow[];
  stock_synced_at?: string | null;
  stock_sync_source?: string | null;
  price_synced_at?: string | null;
  price_sync_source?: string | null;
  api_catalog_synced_at?: string | null;
  api_catalog_sync_source?: string | null;
  [key: string]: unknown;
}

function catalogKeys(fabricNumber: string): string[] {
  const trimmed = fabricNumber.trim();
  const normalized = normalizeDrapersFabricCode(trimmed);
  return [...new Set([normalized, trimmed, `DP${normalized}`].filter(Boolean))];
}

export function indexDrapersCatalogFabrics(
  fabrics: DrapersCatalogFabricRow[]
): Map<string, DrapersCatalogFabricRow> {
  const map = new Map<string, DrapersCatalogFabricRow>();
  for (const fabric of fabrics) {
    for (const key of catalogKeys(fabric.fabric_number)) {
      map.set(key, fabric);
    }
  }
  return map;
}

export function findDrapersCatalogFabric(
  catalogByCode: Map<string, DrapersCatalogFabricRow>,
  fabricCode: string
): DrapersCatalogFabricRow | undefined {
  for (const key of catalogKeys(fabricCode)) {
    const fabric = catalogByCode.get(key);
    if (fabric) return fabric;
  }
  return undefined;
}

export function applyDrapersStockToCatalogFabric(
  fabric: DrapersCatalogFabricRow,
  row: DrapersStockRow,
  syncedAt: string
): boolean {
  const mapped = mapDrapersStockRow(row);
  fabric.stock_status = mapped.stock_status;
  fabric.restock_date = mapped.restock_date;
  fabric.disponibilita_meters = mapped.quantity_meters;
  fabric.stock_updated_at = syncedAt;
  return true;
}

export function applyDrapersPriceToCatalogFabric(
  fabric: DrapersCatalogFabricRow,
  row: DrapersPricelistRow,
  syncedAt: string
): "updated" | "unchanged" {
  const actual = parseDrapersDecimal(row.actual_price);
  const list = parseDrapersDecimal(row.list_price);
  const prevActual = fabric.unit_price ?? null;
  const prevList = fabric.list_price ?? null;

  fabric.unit_price = actual;
  fabric.list_price = list;
  fabric.price_updated_at = syncedAt;

  if (prevActual === actual && prevList === list) return "unchanged";
  return "updated";
}

export function applyDrapersListRowToCatalogFabric(
  fabric: DrapersCatalogFabricRow,
  row: DrapersFabricListRow,
  syncedAt: string
): void {
  fabric.api_is_available = row.is_available;
  fabric.api_is_out_of_stock = row.is_out_of_stock;
  if (row.is_available === false) {
    fabric.is_active = false;
  } else if (row.is_available === true && fabric.unit_price != null) {
    fabric.is_active = true;
  }
  fabric.api_detail_updated_at = syncedAt;
}

export function applyDrapersDetailToCatalogFabric(
  fabric: DrapersCatalogFabricRow,
  detail: DrapersFabricDetail,
  syncedAt: string
): void {
  fabric.api_brand = detail.brand?.trim() || null;
  fabric.api_bunch = detail.bunch?.trim() || null;
  fabric.api_fibres = detail.fibres?.trim() || null;
  fabric.api_is_available = detail.is_available;

  const actual = parseDrapersDecimal(detail.actual_price);
  const list = parseDrapersDecimal(detail.list_price);
  if (Number.isFinite(actual)) fabric.unit_price = actual;
  if (Number.isFinite(list)) fabric.list_price = list;

  if (detail.brand?.trim()) fabric.mill_name = detail.brand.trim();
  if (detail.bunch?.trim()) {
    fabric.collection = detail.bunch.trim();
    const category = fabric.category?.trim();
    fabric.description = category
      ? `${detail.bunch.trim()} — ${category}${fabric.mill_code ? ` (${fabric.mill_code})` : ""}`
      : detail.bunch.trim();
  }
  if (detail.fibres?.trim()) fabric.composition = detail.fibres.trim();

  fabric.is_active = detail.is_available && fabric.unit_price != null;
  fabric.api_detail_updated_at = syncedAt;
  fabric.price_updated_at = syncedAt;
}

export function applyDrapersMediasToCatalogFabric(
  fabric: DrapersCatalogFabricRow,
  medias: DrapersFabricMedias,
  syncedAt: string
): void {
  fabric.swatch_square = medias.square?.trim() || null;
  fabric.swatch_zoom = medias.zoom?.trim() || null;
  fabric.swatch_ruler = medias.ruler?.trim() || null;
  fabric.api_medias_updated_at = syncedAt;
}

/** Prefer API-enriched catalog fields when building SupplierFabric rows. */
export function drapersCatalogDisplayFields(fabric: DrapersCatalogFabricRow): {
  composition: string | null;
  collection: string | null;
  mill_name: string | null;
  description: string | null;
  list_price: number | null;
  swatch_square: string | null;
  swatch_zoom: string | null;
  swatch_ruler: string | null;
  api_is_available: boolean | null;
  api_is_out_of_stock: boolean | null;
  disponibilita_meters: number | null;
} {
  return {
    composition: fabric.api_fibres?.trim() || fabric.composition?.trim() || null,
    collection: fabric.api_bunch?.trim() || fabric.collection?.trim() || null,
    mill_name: fabric.api_brand?.trim() || fabric.mill_name?.trim() || null,
    description: fabric.description?.trim() || null,
    list_price: fabric.list_price ?? fabric.unit_price ?? null,
    swatch_square: fabric.swatch_square?.trim() || null,
    swatch_zoom: fabric.swatch_zoom?.trim() || null,
    swatch_ruler: fabric.swatch_ruler?.trim() || null,
    api_is_available: fabric.api_is_available ?? null,
    api_is_out_of_stock: fabric.api_is_out_of_stock ?? null,
    disponibilita_meters: fabric.disponibilita_meters ?? null,
  };
}
