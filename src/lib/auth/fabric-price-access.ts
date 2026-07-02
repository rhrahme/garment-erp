import { timingSafeEqual } from "crypto";
import type { SessionContext } from "@/lib/auth/session";
import type { PurchaseOrder, PurchaseOrderLine } from "@/lib/types/fabric-sourcing";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export const FABRIC_PRICE_UNLOCK_COOKIE = "fabric_prices_unlocked";
export const FABRIC_PRICE_UNLOCK_MAX_AGE_SEC = 60 * 60 * 12;

export function parseFabricPriceAccessCodes(): string[] {
  const raw = process.env.FABRIC_PRICE_ACCESS_CODES?.trim() ?? "";
  return raw
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
}

function codesMatch(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isFabricPriceAccessCodeValid(code: string): boolean {
  const normalized = code.trim();
  if (!normalized) return false;
  return parseFabricPriceAccessCodes().some((expected) => codesMatch(normalized, expected));
}

export function hasFabricPriceAccess(
  session: SessionContext,
  unlockedCookie: string | undefined | null
): boolean {
  if (session.isSuperAdmin || session.isAdmin || session.canViewFabricListPrices) return true;
  if (session.isClientManager) return false;
  if (unlockedCookie === "1" && parseFabricPriceAccessCodes().length > 0) return true;
  return false;
}

export function redactSupplierFabricPrice<T extends { unit_price?: number | null }>(item: T): T {
  return { ...item, unit_price: null };
}

export function redactSupplierFabricPrices<T extends { unit_price?: number | null }>(items: T[]): T[] {
  return items.map(redactSupplierFabricPrice);
}

export function redactFabricLinePrices<T extends Pick<SalesOrderFabricLine, "unit_price">>(
  line: T
): T {
  return { ...line, unit_price: null };
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
  return { ...line, unit_price: null as unknown as number };
}

export function redactPurchaseOrderPrices(po: PurchaseOrder): PurchaseOrder {
  return {
    ...po,
    total_amount: null as unknown as number,
    lines: po.lines?.map(redactPurchaseOrderLinePrices),
  };
}
