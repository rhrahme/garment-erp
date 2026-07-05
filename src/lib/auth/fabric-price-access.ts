import { timingSafeEqual } from "crypto";
import {
  FABRIC_PRICE_UNLOCK_COOKIE,
  FABRIC_PRICE_UNLOCK_MAX_AGE_SEC,
  MASKED_FABRIC_COST,
  MASKED_FABRIC_PRICE,
} from "@/lib/auth/fabric-price.constants";
import { getInvoiceAmountsPassword, isInvoiceAmountsPasswordValid } from "@/lib/auth/invoice-amounts-access";
import type { SessionContext } from "@/lib/auth/session";
import type { PurchaseOrder, PurchaseOrderLine } from "@/lib/types/fabric-sourcing";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export {
  FABRIC_PRICE_UNLOCK_COOKIE,
  FABRIC_PRICE_UNLOCK_MAX_AGE_SEC,
  MASKED_FABRIC_COST,
  MASKED_FABRIC_PRICE,
};

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

export function isFabricPriceUnlockConfigured(): boolean {
  return parseFabricPriceAccessCodes().length > 0 || getInvoiceAmountsPassword().length > 0;
}

export function isFabricPriceAccessCodeValid(code: string): boolean {
  const normalized = code.trim();
  if (!normalized) return false;
  if (parseFabricPriceAccessCodes().some((expected) => codesMatch(normalized, expected))) return true;
  return isInvoiceAmountsPasswordValid(normalized);
}

/** Admins who may use the reveal toggle (prices stay hidden until unlocked). */
export function canRevealFabricPrices(session: SessionContext): boolean {
  if (session.isClientManager) return false;
  return session.isSuperAdmin || session.isAdmin || session.canViewFabricListPrices;
}

export function hasFabricPriceAccess(
  session: SessionContext,
  unlockedCookie: string | undefined | null
): boolean {
  if (session.isClientManager) return false;
  if (!canRevealFabricPrices(session)) return false;
  if (unlockedCookie === "1" && isFabricPriceUnlockConfigured()) return true;
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
