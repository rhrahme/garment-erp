import { timingSafeEqual } from "crypto";
import type { SessionContext } from "@/lib/auth/session";

export const INVOICE_AMOUNTS_UNLOCK_SESSION_KEY = "invoice_amounts_unlocked";

/** Admin — may view invoice amounts (UI still starts hidden until eye reveal). */
export function canViewInvoiceAmountsAlways(session: Pick<SessionContext, "isAdmin">): boolean {
  return session.isAdmin;
}

/** Admin + sales + accounting — eye toggle on invoice/costing monetary fields. */
export function canToggleInvoiceAmounts(
  session: Pick<SessionContext, "isAdmin" | "isAccountingOperator" | "isSalesOperator">
): boolean {
  return session.isAdmin || session.isAccountingOperator || session.isSalesOperator;
}

/** Admin + accounting reveal hidden amounts without a password. */
export function canRevealInvoiceAmountsWithoutPassword(
  session: Pick<SessionContext, "isAdmin" | "isAccountingOperator">
): boolean {
  return session.isAdmin || session.isAccountingOperator;
}

/** Always start hidden; sessionStorage remembers an explicit Show click for the browser session. */
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
