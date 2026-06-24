import path from "path";
import {
  invalidateDocumentCache,
  loadDocument,
  readJsonFile,
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import { orderLineHasStockAlert } from "@/lib/fabric-sourcing/fabric-stock";
import { isSalesOrderArchived } from "@/lib/sales-orders/archive";
import { totalProductionLabels } from "@/lib/sales-orders/label-display";
import type { SalesOrder, SalesOrdersFile } from "@/lib/types/sales-orders";

const SALES_ORDERS_PATH = path.join(process.cwd(), "src/data/sales-orders.json");
const EMPTY_SALES_ORDERS: SalesOrdersFile = { updated_at: null, orders: [] };

/** ClickUp retail batches (Massimo Dutti, Suit Supply, …) — shown under Ready-Made, not Sales Orders. */
export function isReadyMadeSalesOrder(order: Pick<SalesOrder, "retail_brand">): boolean {
  return Boolean(order.retail_brand?.trim());
}

export function listBespokeSalesOrders(orders: SalesOrder[]): SalesOrder[] {
  return orders.filter((order) => !isReadyMadeSalesOrder(order));
}

export interface SalesOrderListRow {
  id: string;
  so_number: string;
  client_code: string;
  client_name: string;
  product_article: string | null;
  fabric_line_count: number;
  /** Supplier + fabric number pairs for list swatch previews. */
  fabric_preview_lines: Array<{ supplier_id: string; fabric_number: string }>;
  /** Fabric lines flagged out of stock / needing replacement from supplier replies. */
  fabric_stock_alert_count: number;
  production_label_count: number;
  fabric_order_requested_at: string | null;
  order_date: string;
  delivery_date: string | null;
  status: SalesOrder["status"];
  is_archived: boolean;
  /** Lowercase haystack for client-side list search — not shown in the UI. */
  search_text: string;
}

function buildSalesOrderSearchText(order: SalesOrder): string {
  const parts: Array<string | null | undefined> = [
    order.so_number,
    order.client_code,
    order.client_name,
    order.client_reference,
    order.product_article,
    order.retail_brand,
    order.delivery_destination,
    order.status,
    order.notes,
  ];

  for (const line of order.fabric_lines) {
    parts.push(
      line.fabric_number,
      line.supplier_name,
      formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number),
      line.supplier_id,
      line.garment_type,
      line.composition,
      line.color,
      line.stock_status ?? null,
      line.replacement_fabric_number,
      ...(line.label_stickers ?? []).map((sticker) => sticker.code)
    );
  }

  return parts
    .filter((value): value is string => Boolean(value && String(value).trim()))
    .join(" ")
    .toLowerCase();
}

export function readSalesOrders(): SalesOrdersFile {
  return readJsonFile(SALES_ORDERS_PATH, EMPTY_SALES_ORDERS);
}

/** Bypass in-process cache — use before writes that must not clobber a concurrent reset. */
export async function readSalesOrdersFresh(): Promise<SalesOrdersFile> {
  invalidateDocumentCache(SALES_ORDERS_PATH);
  return readJsonFileFreshAsync(SALES_ORDERS_PATH, EMPTY_SALES_ORDERS, { force: true });
}

export async function readSalesOrdersAsync(): Promise<SalesOrdersFile> {
  return readJsonFileAsync(SALES_ORDERS_PATH, EMPTY_SALES_ORDERS);
}

export async function writeSalesOrders(data: SalesOrdersFile): Promise<SalesOrdersFile> {
  const payload: SalesOrdersFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(SALES_ORDERS_PATH, payload);
}

export function toSalesOrderListRow(order: SalesOrder): SalesOrderListRow {
  return {
    id: order.id,
    so_number: order.so_number,
    client_code: order.client_code,
    client_name: order.client_name,
    product_article: order.product_article ?? null,
    fabric_line_count: order.fabric_lines.length,
    fabric_preview_lines: order.fabric_lines.map((line) => ({
      supplier_id: line.supplier_id,
      fabric_number: line.fabric_number,
    })),
    fabric_stock_alert_count: order.fabric_lines.filter((line) => orderLineHasStockAlert(line)).length,
    production_label_count: totalProductionLabels(order.fabric_lines),
    fabric_order_requested_at: order.fabric_order_requested_at ?? null,
    order_date: order.order_date,
    delivery_date: order.delivery_date,
    status: order.status,
    is_archived: isSalesOrderArchived(order),
    search_text: buildSalesOrderSearchText(order),
  };
}

export function getSalesOrderById(id: string): SalesOrder | undefined {
  return readSalesOrders().orders.find((order) => order.id === id);
}

/** Resolve a sales order when the fabric PO record is missing but the SO still references it. */
export function findSalesOrderByFabricPoId(
  fabricPoId: string,
  orders: SalesOrder[] = readSalesOrders().orders
): SalesOrder | undefined {
  const id = fabricPoId.trim();
  if (!id) return undefined;
  return orders.find((order) => order.fabric_po_ids?.includes(id));
}

/** Bypass in-process cache — use on order detail after mutations (multi-instance safe). */
export async function getSalesOrderByIdFresh(id: string): Promise<SalesOrder | undefined> {
  const store = await readJsonFileFreshAsync(SALES_ORDERS_PATH, EMPTY_SALES_ORDERS, { force: true });
  return store.orders.find((order) => order.id === id);
}

export async function deleteSalesOrderById(
  id: string
): Promise<{ ok: true; order: SalesOrder } | { ok: false; error: string; status: number }> {
  const store = readSalesOrders();
  const index = store.orders.findIndex((order) => order.id === id);
  if (index < 0) {
    return { ok: false, error: "Sales order not found.", status: 404 };
  }

  const order = store.orders[index]!;
  if (order.fabric_po_ids.length > 0) {
    return {
      ok: false,
      error: "Cannot delete — supplier fabric orders were already created. Cancel those first.",
      status: 409,
    };
  }

  store.orders.splice(index, 1);
  await writeSalesOrders(store);
  return { ok: true, order };
}

export function generateSoNumber(orders: SalesOrder[]): string {
  const year = new Date().getFullYear();
  const prefix = `SO-${year}-`;
  let max = 0;
  for (const order of orders) {
    if (!order.so_number.startsWith(prefix)) continue;
    const seq = Number.parseInt(order.so_number.slice(prefix.length), 10);
    if (!Number.isNaN(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function buildClientReference(clientCode: string, soNumber: string): string {
  return `${clientCode}-${soNumber}`;
}
