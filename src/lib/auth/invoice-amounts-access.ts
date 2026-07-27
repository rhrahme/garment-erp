import { timingSafeEqual } from "crypto";
import type { SessionContext } from "@/lib/auth/session";

export const INVOICE_AMOUNTS_UNLOCK_SESSION_KEY = "invoice_amounts_unlocked";

/** Admin — always see amounts, no eye toggle. */
export function canViewInvoiceAmountsAlways(session: Pick<SessionContext, "isAdmin">): boolean {
  return session.isAdmin;
}

/** Sales + accounting — eye toggle on invoice/costing monetary fields. */
export function canToggleInvoiceAmounts(
  session: Pick<SessionContext, "isAccountingOperator" | "isSalesOperator">
): boolean {
  return session.isAccountingOperator || session.isSalesOperator;
}

/** Accounting reveals hidden amounts without a password. */
export function canRevealInvoiceAmountsWithoutPassword(
  session: Pick<SessionContext, "isAccountingOperator">
): boolean {
  return session.isAccountingOperator;
}

/** When the toggle exists, start with amounts visible (admin always visible separately). */
export function invoiceAmountsVisibleByDefault(
  session: Pick<SessionContext, "isAdmin" | "isAccountingOperator">
): boolean {
  return session.isAdmin || session.isAccountingOperator;
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
