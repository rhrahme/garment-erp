import { timingSafeEqual } from "crypto";
import {
  FABRIC_PRICE_UNLOCK_COOKIE,
  FABRIC_PRICE_UNLOCK_MAX_AGE_SEC,
  MASKED_FABRIC_COST,
  MASKED_FABRIC_PRICE,
} from "@/lib/auth/fabric-price.constants";
import { isInvoiceAmountsPasswordValid } from "@/lib/auth/invoice-amounts-access";
import type { SessionContext } from "@/lib/auth/session";

export {
  redactFabricLinePrices,
  redactPriceFields,
  redactPurchaseOrderLinePrices,
  redactPurchaseOrderPrices,
  redactSalesOrderFabricPrices,
  redactSupplierFabricPrice,
  redactSupplierFabricPrices,
  RESTRICTED_PRICE_FIELD_NAMES,
} from "@/lib/auth/fabric-price-redact";

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
  return (
    session.isAdmin &&
    !session.isClientManager &&
    !session.isTaskOperator &&
    !session.isProductionOperator &&
    !session.isPatternOperator &&
    !session.isSalesOperator
  );
}

/**
 * Sales operators should not see supplier stock / availability badges
 * (catalog Stock column, picker labels, order-line badges) for now.
 * Admin / QC / task keep stock visibility.
 */
export function canViewFabricStock(session: Pick<SessionContext, "isSalesOperator">): boolean {
  return !session.isSalesOperator;
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

