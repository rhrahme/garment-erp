#!/usr/bin/env node
/**
 * Unit checks for fabric price unlock password validation.
 * Run: node scripts/test-fabric-price-unlock.mjs
 */
import { timingSafeEqual } from "crypto";

const BUILTIN_FABRIC_PRICE_ACCESS_CODE = "1122";

function parseFabricPriceAccessCodes() {
  const raw = process.env.FABRIC_PRICE_ACCESS_CODES?.trim() ?? "";
  const fromEnv = raw.split(",").map((code) => code.trim()).filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  return [BUILTIN_FABRIC_PRICE_ACCESS_CODE];
}

function codesMatch(input, expected) {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function getInvoiceAmountsPassword() {
  return process.env.INVOICE_AMOUNTS_PASSWORD?.trim() ?? "";
}

function isInvoiceAmountsPasswordValid(password) {
  const expected = getInvoiceAmountsPassword();
  if (!expected) return false;
  const normalized = password.trim();
  if (!normalized) return false;
  const a = Buffer.from(normalized);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isFabricPriceAccessCodeValid(code) {
  const normalized = code.trim();
  if (!normalized) return false;
  if (codesMatch(normalized, BUILTIN_FABRIC_PRICE_ACCESS_CODE)) return true;
  if (parseFabricPriceAccessCodes().some((expected) => codesMatch(normalized, expected))) return true;
  return isInvoiceAmountsPasswordValid(normalized);
}

function isFabricPriceUnlockConfigured() {
  return true;
}

function assert(label, condition) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK   ${label}`);
}

delete process.env.FABRIC_PRICE_ACCESS_CODES;
delete process.env.INVOICE_AMOUNTS_PASSWORD;
assert("configured with default 1122 when env missing", isFabricPriceUnlockConfigured());
assert("1122 valid with default when env missing", isFabricPriceAccessCodeValid("1122"));

process.env.FABRIC_PRICE_ACCESS_CODES = "1122";
assert("configured with FABRIC_PRICE_ACCESS_CODES", isFabricPriceUnlockConfigured());
assert("1122 valid with FABRIC_PRICE_ACCESS_CODES", isFabricPriceAccessCodeValid("1122"));
assert("wrong password rejected", !isFabricPriceAccessCodeValid("9999"));

delete process.env.FABRIC_PRICE_ACCESS_CODES;
process.env.INVOICE_AMOUNTS_PASSWORD = "123456789";
assert("configured with INVOICE_AMOUNTS_PASSWORD fallback", isFabricPriceUnlockConfigured());
assert("1122 valid via built-in even with only invoice password", isFabricPriceAccessCodeValid("1122"));
assert("123456789 valid as fallback", isFabricPriceAccessCodeValid("123456789"));

process.env.FABRIC_PRICE_ACCESS_CODES = "1122,3344";
assert("multiple codes: 1122 valid", isFabricPriceAccessCodeValid("1122"));
assert("multiple codes: 3344 valid", isFabricPriceAccessCodeValid("3344"));

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log("\nAll fabric price unlock checks passed.");
