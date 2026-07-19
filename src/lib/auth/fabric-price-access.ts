import { timingSafeEqual } from "crypto";
import {
  FABRIC_PRICE_UNLOCK_COOKIE,
  FABRIC_PRICE_UNLOCK_MAX_AGE_SEC,
  MASKED_FABRIC_COST,
  MASKED_FABRIC_PRICE,
} from "@/lib/auth/fabric-price.constants";
import { isInvoiceAmountsPasswordValid } from "@/lib/auth/invoice-amounts-access";
import type { SessionContext } from "@/lib/auth/session";
import type { PurchaseOrder, PurchaseOrderLine } from "@/lib/types/fabric-sourcing";
import type { SalesOrder, SalesOrderFabricLine } from "@/lib/types/sales-orders";

export {
  FABRIC_PRICE_UNLOCK_COOKIE,
  FABRIC_PRICE_UNLOCK_MAX_AGE_SEC,
  MASKED_FABRIC_COST,
  MASKED_FABRIC_PRICE,
};

/** Built-in unlock code; always accepted. Set FABRIC_PRICE_ACCESS_CODES on Vercel to add/override extras. */
const BUILTIN_FABRIC_PRICE_ACCESS_CODE = "1122";

export function parseFabricPriceAccessCodes(): string[] {
  const raw = process.env.FABRIC_PRICE_ACCESS_CODES?.trim() ?? "";
  const fromEnv = raw
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  return [BUILTIN_FABRIC_PRICE_ACCESS_CODE];
}

function codesMatch(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isFabricPriceUnlockConfigured(): boolean {
  // BUILTIN_FABRIC_PRICE_ACCESS_CODE is always available without any Vercel env.
  return true;
}

export function isFabricPriceAccessCodeValid(code: string): boolean {
  const normalized = code.trim();
  if (!normalized) return false;
  if (codesMatch(normalized, BUILTIN_FABRIC_PRICE_ACCESS_CODE)) return true;
  if (parseFabricPriceAccessCodes().some((expected) => codesMatch(normalized, expected))) return true;
  return isInvoiceAmountsPasswordValid(normalized);
}

/** Single role gate for every price-bearing UI and API surface. */
export function canViewPrices(session: SessionContext): boolean {
  return session.isAdmin && !session.isClientManager && !session.isTaskOperator;
}

/** Admins who may use the reveal toggle (prices stay hidden until unlocked). */
export function canRevealFabricPrices(session: SessionContext): boolean {
  return canViewPrices(session);
}

export function hasFabricPriceAccess(
  session: SessionContext,
  unlockedCookie: string | undefined | null
): boolean {
  if (!canViewPrices(session)) return false;
  if (unlockedCookie === "1" && isFabricPriceUnlockConfigured()) return true;
  return false;
}

const PRICE_FIELD_NAMES = new Set([
  "unit_price",
  "total_amount",
  "subtotal",
  "fabric_cost",
  "fabric_cost_summary",
  "currency",
]);

/** Recursively omit price-bearing keys so restricted API payloads contain no price fields. */
export function redactPriceFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactPriceFields(item)) as T;
  }
  if (value == null || typeof value !== "object") return value;

  const safeEntries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !PRICE_FIELD_NAMES.has(key))
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
