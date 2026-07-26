import { RESTRICTED_PRICE_FIELD_NAME_SET } from "@/lib/auth/price-field-names";
import type { PurchaseOrder, PurchaseOrderLine } from "@/lib/types/fabric-sourcing";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export { RESTRICTED_PRICE_FIELD_NAMES } from "@/lib/auth/price-field-names";

/** Client-safe recursive price redaction (no Node crypto / env). */
export function redactPriceFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactPriceFields(item)) as T;
  }
  if (value == null || typeof value !== "object") return value;

  const safeEntries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !RESTRICTED_PRICE_FIELD_NAME_SET.has(key))
    .map(([key, nested]) => [key, redactPriceFields(nested)]);
  return Object.fromEntries(safeEntries) as T;
}

export function redactSupplierFabricPrice<T extends { unit_price?: number | null }>(item: T): T {
  return redactPriceFields(item);
}

export function redactSupplierFabricPrices<T extends { unit_price?: number | null }>(items: T[]): T[] {
  return items.map(redactSupplierFabricPrice);
}

export function redactFabricLinePrices<T extends Pick<SalesOrderFabricLine, "unit_price">>(
  line: T
): T {
  return redactPriceFields(line);
}

export function redactSalesOrderFabricPrices(order: SalesOrder): SalesOrder {
  return {
    ...order,
    fabric_lines: order.fabric_lines.map(redactFabricLinePrices),
  };
}

export function redactPurchaseOrderLinePrices<T extends Pick<PurchaseOrderLine, "unit_price">>(
  line: T
): T {
  return redactPriceFields(line);
}

export function redactPurchaseOrderPrices(po: PurchaseOrder): PurchaseOrder {
  return redactPriceFields(po);
}
