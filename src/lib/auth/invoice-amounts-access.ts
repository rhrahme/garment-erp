import { timingSafeEqual } from "crypto";
import type { SessionContext } from "@/lib/auth/session";

/** @deprecated Unlock is in-memory; key kept so old sessionStorage entries are ignored. */
export const INVOICE_AMOUNTS_UNLOCK_SESSION_KEY = "invoice_amounts_unlocked";

/** Single gate: prices, invoices, costing, salaries, and any other money. */
export function canViewMoney(session: Pick<SessionContext, "isAdmin">): boolean {
  return Boolean(session.isAdmin);
}

/** Admin — may view invoice amounts (UI still starts hidden until eye reveal). */
export function canViewInvoiceAmountsAlways(session: Pick<SessionContext, "isAdmin">): boolean {
  return canViewMoney(session);
}

/** Eye toggle on invoice/costing monetary fields — admin only. */
export function canToggleInvoiceAmounts(session: Pick<SessionContext, "isAdmin">): boolean {
  return canViewMoney(session);
}

/** Reveal hidden amounts without a password — admin only. */
export function canRevealInvoiceAmountsWithoutPassword(
  session: Pick<SessionContext, "isAdmin">
): boolean {
  return canViewMoney(session);
}

/** Always start hidden; explicit Show click unlocks in-memory until refresh or Hide. */
export function invoiceAmountsVisibleByDefault(
  _session?: Pick<SessionContext, "isAdmin" | "isAccountingOperator">
): boolean {
  return false;
}

export function getInvoiceAmountsPassword(): string {
  return process.env.INVOICE_AMOUNTS_PASSWORD?.trim() ?? "";
}

function passwordsMatch(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isInvoiceAmountsPasswordValid(password: string): boolean {
  const expected = getInvoiceAmountsPassword();
  if (!expected) return false;
  const normalized = password.trim();
  if (!normalized) return false;
  return passwordsMatch(normalized, expected);
}
