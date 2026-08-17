import path from "path";
import {
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import {
  EMPTY_INVENTORY_STORE,
  normalizeGarmentTypeKey,
  type GarmentRecipe,
  type GarmentRecipeLine,
  type InventoryItem,
  type InventoryLedgerEntry,
  type InventoryLedgerReason,
  type InventoryStoreFile,
} from "@/lib/types/inventory";

const STORE_PATH = path.join(process.cwd(), "src/data/inventory-store.json");

/** Keep the ledger bounded - old entries roll off, stock stays correct. */
const LEDGER_MAX_ENTRIES = 2000;

function normalize(raw: InventoryStoreFile | null | undefined): InventoryStoreFile {
  return {
    updated_at: raw?.updated_at ?? null,
    items: Array.isArray(raw?.items) ? raw!.items : [],
    recipes: Array.isArray(raw?.recipes) ? raw!.recipes : [],
    ledger: Array.isArray(raw?.ledger) ? raw!.ledger : [],
  };
}

export async function readInventoryStore(): Promise<InventoryStoreFile> {
  return normalize(await readJsonFileAsync(STORE_PATH, EMPTY_INVENTORY_STORE));
}

export async function readInventoryStoreFresh(): Promise<InventoryStoreFile> {
  return normalize(
    await readJsonFileFreshAsync(STORE_PATH, EMPTY_INVENTORY_STORE, { force: true })
  );
}

async function save(store: InventoryStoreFile): Promise<void> {
  store.updated_at = new Date().toISOString();
  if (store.ledger.length > LEDGER_MAX_ENTRIES) {
    store.ledger = store.ledger.slice(-LEDGER_MAX_ENTRIES);
  }
  await saveDocument(STORE_PATH, store);
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type UpsertInventoryItemInput = {
  id?: string | null;
  name: string;
  category?: string | null;
  brand?: string | null;
  unit?: string | null;
  low_stock_threshold?: number | null;
  location?: string | null;
  notes?: string | null;
};

export async function upsertInventoryItem(
  input: UpsertInventoryItemInput,
  actedBy: string | null
): Promise<InventoryItem> {
  const store = await readInventoryStoreFresh();
  const now = new Date().toISOString();
  const name = input.name.trim();
  if (!name) throw new Error("Item name is required.");

  const existing = input.id ? store.items.find((item) => item.id === input.id) : undefined;
  if (existing) {
    existing.name = name;
    existing.category = input.category?.trim() || null;
    existing.brand = input.brand?.trim() || null;
    existing.unit = input.unit?.trim() || existing.unit || "pcs";
    existing.low_stock_threshold =
      input.low_stock_threshold == null ? null : Math.max(0, input.low_stock_threshold);
    existing.location = input.location?.trim() || null;
    existing.notes = input.notes?.trim() || null;
    existing.updated_at = now;
    await save(store);
    return existing;
  }

  const item: InventoryItem = {
    id: newId("inv"),
    name,
    category: input.category?.trim() || null,
    brand: input.brand?.trim() || null,
    unit: input.unit?.trim() || "pcs",
    quantity_on_hand: 0,
    low_stock_threshold:
      input.low_stock_threshold == null ? null : Math.max(0, input.low_stock_threshold),
    location: input.location?.trim() || null,
    notes: input.notes?.trim() || null,
    created_at: now,
    updated_at: now,
  };
  void actedBy;
  store.items.push(item);
  await save(store);
  return item;
}

export async function adjustInventoryQuantity(
  itemId: string,
  delta: number,
  reason: InventoryLedgerReason,
  meta: { note?: string | null; actedBy?: string | null } = {}
): Promise<{ item: InventoryItem; entry: InventoryLedgerEntry }> {
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("Adjustment quantity must be a non-zero number.");
  }
  const store = await readInventoryStoreFresh();
  const item = store.items.find((row) => row.id === itemId);
  if (!item) throw new Error("Inventory item not found.");

  const now = new Date().toISOString();
  item.quantity_on_hand = Math.round((item.quantity_on_hand + delta) * 100) / 100;
  item.updated_at = now;

  const entry: InventoryLedgerEntry = {
    id: newId("led"),
    item_id: item.id,
    delta,
    balance_after: item.quantity_on_hand,
    reason,
    garment_type: null,
    so_number: null,
    production_code: null,
    sales_order_line_id: null,
    note: meta.note?.trim() || null,
    created_at: now,
    created_by: meta.actedBy?.trim() || null,
  };
  store.ledger.push(entry);
  await save(store);
  return { item, entry };
}

export async function setGarmentRecipe(
  garmentType: string,
  lines: GarmentRecipeLine[],
  actedBy: string | null
): Promise<GarmentRecipe> {
  const key = normalizeGarmentTypeKey(garmentType);
  if (!key) throw new Error("Garment type is required.");
  const store = await readInventoryStoreFresh();
  const itemIds = new Set(store.items.map((item) => item.id));
  const cleaned = lines
    .filter((line) => itemIds.has(line.item_id))
    .map((line) => ({
      item_id: line.item_id,
      quantity_per_garment: Math.max(0, Number(line.quantity_per_garment) || 0),
    }))
    .filter((line) => line.quantity_per_garment > 0);

  const now = new Date().toISOString();
  const existingIndex = store.recipes.findIndex(
    (recipe) => normalizeGarmentTypeKey(recipe.garment_type) === key
  );
  const recipe: GarmentRecipe = {
    garment_type: garmentType.trim(),
    lines: cleaned,
    updated_at: now,
    updated_by: actedBy?.trim() || null,
  };
  if (existingIndex >= 0) {
    if (cleaned.length === 0) {
      store.recipes.splice(existingIndex, 1);
    } else {
      store.recipes[existingIndex] = recipe;
    }
  } else if (cleaned.length > 0) {
    store.recipes.push(recipe);
  }
  await save(store);
  return recipe;
}

export function findGarmentRecipe(
  store: InventoryStoreFile,
  garmentType: string | null | undefined
): GarmentRecipe | null {
  const key = normalizeGarmentTypeKey(garmentType);
  if (!key) return null;
  return (
    store.recipes.find((recipe) => normalizeGarmentTypeKey(recipe.garment_type) === key) ?? null
  );
}

export type GarmentDeductionResult = {
  deducted: boolean;
  /** "no_recipe" | "already_deducted" | null when deducted. */
  skipped_reason: "no_recipe" | "already_deducted" | null;
  entries: InventoryLedgerEntry[];
  low_stock_items: InventoryItem[];
};

export type GarmentDeductionMeta = {
  garmentType: string;
  salesOrderLineId: string;
  soNumber?: string | null;
  productionCode?: string | null;
  actedBy?: string | null;
  nowIso?: string;
};

/**
 * Pure part of the deduction (exported for tests): mutates the given store
 * in place and reports what happened. Deduped per sales order fabric line so
 * rescans and multi-piece sets (Suit = jacket + trouser on ONE line = one
 * suit hanger) never deduct twice. Stock may go negative on purpose - a red
 * count is the signal that physical stock and ERP disagree.
 */
export function computeGarmentInventoryDeduction(
  store: InventoryStoreFile,
  meta: GarmentDeductionMeta
): GarmentDeductionResult {
  const recipe = findGarmentRecipe(store, meta.garmentType);
  if (!recipe || recipe.lines.length === 0) {
    return { deducted: false, skipped_reason: "no_recipe", entries: [], low_stock_items: [] };
  }

  const lineId = meta.salesOrderLineId.trim();
  if (
    lineId &&
    store.ledger.some(
      (entry) => entry.reason === "garment_packed" && entry.sales_order_line_id === lineId
    )
  ) {
    return { deducted: false, skipped_reason: "already_deducted", entries: [], low_stock_items: [] };
  }

  const now = meta.nowIso ?? new Date().toISOString();
  const entries: InventoryLedgerEntry[] = [];
  const lowStock: InventoryItem[] = [];
  for (const line of recipe.lines) {
    const item = store.items.find((row) => row.id === line.item_id);
    if (!item) continue;
    item.quantity_on_hand =
      Math.round((item.quantity_on_hand - line.quantity_per_garment) * 100) / 100;
    item.updated_at = now;
    const entry: InventoryLedgerEntry = {
      id: newId("led"),
      item_id: item.id,
      delta: -line.quantity_per_garment,
      balance_after: item.quantity_on_hand,
      reason: "garment_packed",
      garment_type: recipe.garment_type,
      so_number: meta.soNumber ?? null,
      production_code: meta.productionCode ?? null,
      sales_order_line_id: lineId || null,
      note: null,
      created_at: now,
      created_by: meta.actedBy?.trim() || null,
    };
    store.ledger.push(entry);
    entries.push(entry);
    if (item.low_stock_threshold != null && item.quantity_on_hand <= item.low_stock_threshold) {
      lowStock.push({ ...item });
    }
  }

  if (entries.length === 0) {
    return { deducted: false, skipped_reason: "no_recipe", entries: [], low_stock_items: [] };
  }
  return { deducted: true, skipped_reason: null, entries, low_stock_items: lowStock };
}

/** IO wrapper: read fresh, apply, persist only when something was deducted. */
export async function applyGarmentInventoryDeduction(
  meta: GarmentDeductionMeta
): Promise<GarmentDeductionResult> {
  const store = await readInventoryStoreFresh();
  const result = computeGarmentInventoryDeduction(store, meta);
  if (result.deducted) await save(store);
  return result;
}
