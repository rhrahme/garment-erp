import { timingSafeEqual } from "crypto";

export const INVOICE_AMOUNTS_UNLOCK_SESSION_KEY = "invoice_amounts_unlocked";

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
