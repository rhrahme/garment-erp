import path from "path";
import { ensureDocumentsLoaded, readJsonFile, writeJsonFile } from "@/lib/data/json-file-cache";
import type { PurchaseOrder, PurchaseOrderLine } from "@/lib/types/fabric-sourcing";

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

function writeStore(store: FabricOrderStore): void {
  writeJsonFile(STORE_PATH, store);
}

export function listStoredFabricOrders(): PurchaseOrder[] {
  return readStore().orders;
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

export function markStoredFabricOrderSent(
  id: string,
  details: { emailed_at: string; email_to: string; status?: string }
): PurchaseOrder | undefined {
  const store = readStore();
  const order = store.orders.find((item) => item.id === id);
  if (!order) return undefined;

  order.emailed_at = details.emailed_at;
  order.email_to = details.email_to;
  order.status = details.status ?? "sent";
  writeStore(store);
  return order;
}

export function markStoredFabricOrdersSent(
  ids: string[],
  details: { emailed_at: string; email_to: string; status?: string }
): PurchaseOrder[] {
  const store = readStore();
  const idSet = new Set(ids);
  const updated: PurchaseOrder[] = [];

  for (const order of store.orders) {
    if (!idSet.has(order.id)) continue;
    order.emailed_at = details.emailed_at;
    order.email_to = details.email_to;
    order.status = details.status ?? "sent";
    updated.push(order);
  }

  if (updated.length > 0) {
    writeStore(store);
  }

  return updated;
}
