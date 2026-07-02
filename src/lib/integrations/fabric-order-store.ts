import path from "path";
import { readJsonFileFreshAsync } from "@/lib/data/document-persistence";
import {
  ensureDocumentsLoaded,
  readJsonFile,
  writeJsonFile,
  writeJsonFileAsync,
} from "@/lib/data/json-file-cache";
import type { PurchaseOrder, PurchaseOrderLine } from "@/lib/types/fabric-sourcing";
import { isFabricOrderFullySent } from "@/lib/fabric-sourcing/fabric-order-line-status";

const STORE_PATH = path.join(process.cwd(), "fabric-orders.local.json");

interface FabricOrderStore {
  orders: PurchaseOrder[];
}

/**
 * Warm the `fabric_orders` document from Supabase into the in-process cache.
 *
 * The fabric-order store is a LAZY Supabase document, so the synchronous
 * `readStore()` returns the (empty) local fallback on any serverless instance
 * that hasn't loaded it yet. Reads AND writes must await this first — otherwise
 * a cold instance reads an empty list (e.g. the empty /supplier-emails page) or,
 * worse, a create overwrites the whole Supabase document with a single order.
 */
export async function ensureFabricOrdersLoaded(): Promise<void> {
  await ensureDocumentsLoaded(["fabric_orders"]);
}

function readStore(): FabricOrderStore {
  return readJsonFile(STORE_PATH, { orders: [] });
}

async function readStoreFresh(): Promise<FabricOrderStore> {
  await ensureFabricOrdersLoaded();
  return readJsonFileFreshAsync(STORE_PATH, { orders: [] }, { force: true });
}

function writeStore(store: FabricOrderStore): void {
  writeJsonFile(STORE_PATH, store);
}

export function updateStoredFabricOrders(
  updater: (orders: PurchaseOrder[]) => PurchaseOrder[]
): PurchaseOrder[] {
  const store = readStore();
  store.orders = updater(store.orders);
  writeStore(store);
  return store.orders;
}

/** Read-modify-write against Supabase — avoids clobbering emailed_at from stale cache. */
export async function updateStoredFabricOrdersAsync(
  updater: (orders: PurchaseOrder[]) => PurchaseOrder[]
): Promise<PurchaseOrder[]> {
  const store = await readStoreFresh();
  store.orders = updater(store.orders);
  await writeJsonFileAsync(STORE_PATH, store);
  return store.orders;
}

export function listStoredFabricOrders(): PurchaseOrder[] {
  return readStore().orders;
}

/** Reload from Supabase — use when listing supplier emails after writes on another instance. */
export async function listStoredFabricOrdersFresh(): Promise<PurchaseOrder[]> {
  const store = await readJsonFileFreshAsync(STORE_PATH, { orders: [] }, { force: true });
  return store.orders;
}

export function getStoredFabricOrder(id: string): PurchaseOrder | undefined {
  return readStore().orders.find((order) => order.id === id);
}

export function createStoredFabricOrder(input: {
  supplier_id: string;
  client_reference: string;
  sales_order_id?: string | null;
  lines: Array<{
    fabric_number: string;
    quantity_ordered: number;
    label_count?: number;
    label_stickers?: Array<{ code: string; piece_name: string; sequence: number }>;
    garment_type?: string;
    client_reference?: string | null;
    unit_price?: number;
  }>;
  supplier?: PurchaseOrder["supplier"];
}): PurchaseOrder {
  const store = readStore();
  const nextNum = store.orders.length + 1;
  const id = `po-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const po_number = `PO-${new Date().getFullYear()}-${String(nextNum).padStart(4, "0")}`;

  const lines: PurchaseOrderLine[] = input.lines.map((line, index) => ({
    id: `${id}-line-${index + 1}`,
    fabric_number: line.fabric_number,
    quantity_ordered: line.quantity_ordered,
    unit_price: line.unit_price ?? 0,
    label_count: line.label_count ?? null,
    label_stickers: line.label_stickers ?? null,
    garment_type: line.garment_type ?? null,
    client_reference: line.client_reference ?? input.client_reference,
  }));

  const order: PurchaseOrder = {
    id,
    po_number,
    supplier_id: input.supplier_id,
    status: "draft",
    order_date: new Date().toISOString().slice(0, 10),
    expected_date: null,
    total_amount: lines.reduce((sum, line) => sum + line.quantity_ordered * line.unit_price, 0),
    client_reference: input.client_reference,
    emailed_at: null,
    email_to: null,
    expected_carrier: "DHL",
    sales_order_id: input.sales_order_id ?? null,
    supplier: input.supplier,
    lines,
  };

  store.orders.unshift(order);
  writeStore(store);
  return order;
}

export async function markStoredFabricOrderSent(
  id: string,
  details: { emailed_at: string; email_to: string; status?: string }
): Promise<PurchaseOrder | undefined> {
  const updated = await markStoredFabricOrdersSent([id], details);
  return updated[0];
}

/** Await Supabase persistence so the next list refresh cannot read stale sent state. */
export async function markStoredFabricOrdersSent(
  ids: string[],
  details: { emailed_at: string; email_to: string; status?: string }
): Promise<PurchaseOrder[]> {
  const store = await readStoreFresh();
  const idSet = new Set(ids);
  const updated: PurchaseOrder[] = [];

  for (const order of store.orders) {
    if (!idSet.has(order.id)) continue;
    order.emailed_at = details.emailed_at;
    order.email_to = details.email_to;
    order.status = details.status ?? "sent";
    for (const line of order.lines ?? []) {
      line.emailed_at = details.emailed_at;
    }
    updated.push(order);
  }

  if (updated.length > 0) {
    await writeJsonFileAsync(STORE_PATH, store);
  }

  return updated;
}

/** Mark specific PO lines as sent; completes the PO when all lines are sent. */
export async function markStoredFabricOrderLinesSent(
  lineIdsByPoId: Record<string, string[]>,
  details: { emailed_at: string; email_to: string; status?: string }
): Promise<PurchaseOrder[]> {
  const store = await readStoreFresh();
  const updated: PurchaseOrder[] = [];

  for (const order of store.orders) {
    const lineIds = lineIdsByPoId[order.id];
    if (!lineIds?.length) continue;

    const lineIdSet = new Set(lineIds);
    let touched = false;

    for (const line of order.lines ?? []) {
      if (!lineIdSet.has(line.id)) continue;
      line.emailed_at = details.emailed_at;
      touched = true;
    }

    if (!touched) continue;

    if (isFabricOrderFullySent(order)) {
      order.emailed_at = details.emailed_at;
      order.email_to = details.email_to;
      order.status = details.status ?? "sent";
    }

    updated.push(order);
  }

  if (updated.length > 0) {
    await writeJsonFileAsync(STORE_PATH, store);
  }

  return updated;
}

/** Cancel pending (not yet emailed) fabric POs — keeps records with status cancelled. */
export function cancelStoredFabricOrders(ids: string[]): PurchaseOrder[] {
  const store = readStore();
  const idSet = new Set(ids);
  const updated: PurchaseOrder[] = [];

  for (const order of store.orders) {
    if (!idSet.has(order.id)) continue;
    if (order.emailed_at || order.status === "cancelled") continue;
    order.status = "cancelled";
    updated.push(order);
  }

  if (updated.length > 0) {
    writeStore(store);
  }

  return updated;
}
