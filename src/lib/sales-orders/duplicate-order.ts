import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

const INACTIVE_SALES_ORDER_STATUSES = new Set(["complete", "cancelled", "delivered"]);

export function fabricArticleKey(line: Pick<SalesOrderFabricLine, "garment_type" | "fabric_number" | "supplier_id">): string {
  return [line.garment_type, line.fabric_number, line.supplier_id]
    .map((part) => String(part).trim().toLowerCase())
    .join("|");
}

export function formatFabricArticleDuplicateError(
  line: Pick<SalesOrderFabricLine, "garment_type" | "fabric_number" | "supplier_id" | "supplier_name">
): string {
  const supplierLabel = line.supplier_name?.trim() || line.supplier_id;
  return `This order already has ${supplierLabel} ${line.fabric_number} for ${line.garment_type}. Edit the existing line instead of adding a duplicate.`;
}

export function findDuplicateFabricArticle(
  lines: SalesOrderFabricLine[],
  candidate: Pick<SalesOrderFabricLine, "garment_type" | "fabric_number" | "supplier_id">,
  excludeLineId?: string
): SalesOrderFabricLine | undefined {
  const key = fabricArticleKey(candidate);
  return lines.find((line) => line.id !== excludeLineId && fabricArticleKey(line) === key);
}

/** Stable signature for a full order's fabric list (same lines = duplicate order). */
export function orderFabricSignature(lines: SalesOrderFabricLine[]): string {
  return lines
    .map((line) => `${fabricArticleKey(line)}|${line.quantity}`)
    .sort()
    .join(";");
}

export function findOpenOrderWithSameArticles(
  orders: SalesOrder[],
  clientId: string,
  lines: SalesOrderFabricLine[]
): SalesOrder | null {
  const signature = orderFabricSignature(lines);
  if (!signature) return null;

  for (const order of orders) {
    if (order.client_id !== clientId) continue;
    if (INACTIVE_SALES_ORDER_STATUSES.has(order.status)) continue;
    if (order.fabric_lines.length !== lines.length) continue;
    if (orderFabricSignature(order.fabric_lines) === signature) {
      return order;
    }
  }
  return null;
}

export function findOpenOrderWithOverlappingArticle(
  orders: SalesOrder[],
  clientId: string,
  line: Pick<SalesOrderFabricLine, "garment_type" | "fabric_number" | "supplier_id">
): SalesOrder | null {
  const key = fabricArticleKey(line);
  for (const order of orders) {
    if (order.client_id !== clientId) continue;
    if (INACTIVE_SALES_ORDER_STATUSES.has(order.status)) continue;
    if (order.fabric_lines.some((existing) => fabricArticleKey(existing) === key)) {
      return order;
    }
  }
  return null;
}

/** Keep one row per client when two open orders have identical fabric lists. */
export function dedupeIdenticalSalesOrders<T extends Pick<SalesOrder, "client_id" | "so_number" | "fabric_lines">>(
  orders: T[]
): T[] {
  const bestByKey = new Map<string, T>();

  for (const order of orders) {
    const key = `${order.client_id}::${orderFabricSignature(order.fabric_lines)}`;
    const existing = bestByKey.get(key);
    if (!existing || order.so_number > existing.so_number) {
      bestByKey.set(key, order);
    }
  }

  return [...bestByKey.values()];
}
