import path from "path";
import { readJsonFile, writeJsonFile } from "@/lib/data/json-file-cache";
import type { SalesOrder, SalesOrdersFile } from "@/lib/types/sales-orders";

const SALES_ORDERS_PATH = path.join(process.cwd(), "src/data/sales-orders.json");
const EMPTY_SALES_ORDERS: SalesOrdersFile = { updated_at: null, orders: [] };

export interface SalesOrderListRow {
  id: string;
  so_number: string;
  client_code: string;
  client_name: string;
  product_article: string | null;
  fabric_line_count: number;
  order_date: string;
  delivery_date: string | null;
  status: SalesOrder["status"];
}

export function readSalesOrders(): SalesOrdersFile {
  return readJsonFile(SALES_ORDERS_PATH, EMPTY_SALES_ORDERS);
}

export function writeSalesOrders(data: SalesOrdersFile): SalesOrdersFile {
  const payload: SalesOrdersFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return writeJsonFile(SALES_ORDERS_PATH, payload);
}

export function toSalesOrderListRow(order: SalesOrder): SalesOrderListRow {
  return {
    id: order.id,
    so_number: order.so_number,
    client_code: order.client_code,
    client_name: order.client_name,
    product_article: order.product_article ?? null,
    fabric_line_count: order.fabric_lines.length,
    order_date: order.order_date,
    delivery_date: order.delivery_date,
    status: order.status,
  };
}

export function getSalesOrderById(id: string): SalesOrder | undefined {
  return readSalesOrders().orders.find((order) => order.id === id);
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
