/**
 * USB wedge scanners sometimes pause mid-code long enough that an aggressive
 * idle flush splits one QR into fragments (FR-0129 + -L02-OS-1/2, EMP + :id,
 * EMPALT / EMPIRON / EMPBTN / EMPWASH / EMPHOLE / EMPBST / EMPCHMP / EMPBART + :id).
 */

import { EMPLOYEE_BADGE_QR_PREFIXES } from "@/lib/hr/employee-qr";

/** Incomplete EMP* badge prefixes the wedge may flush alone. */
function looksLikePartialEmployeeBadgePrefix(code: string): boolean {
  const c = code.trim().toUpperCase();
  if (!c.startsWith("EMP")) return false;
  const token = c.endsWith(":") ? c.slice(0, -1) : c;
  if (token === "EMP" || EMPLOYEE_BADGE_QR_PREFIXES.includes(token)) return true;
  return EMPLOYEE_BADGE_QR_PREFIXES.some(
    (prefix) => prefix.startsWith(token) && token.length < prefix.length
  );
}

/** True when a flushed buffer looks like an incomplete wedge fragment. */
export function looksLikePartialScanFragment(code: string): boolean {
  const c = code.trim();
  if (!c) return true;
  if (c.length <= 2) return true;
  if (looksLikePartialEmployeeBadgePrefix(c)) return true;
  if (/^:\d+$/.test(c)) return true;
  // Brand-SO prefix without line/piece (FR-0129)
  if (/^[A-Z]{2,}-\d{4}$/i.test(c)) return true;
  // Continuation of a piece code
  if (/^-L\d{2}/i.test(c)) return true;
  if (/^-\d/.test(c)) return true;
  return false;
}

/**
 * Merge two consecutive fragments into one scan code when they clearly belong
 * together. Returns null when they should stay separate scans.
 */
export function tryMergeScanFragments(prev: string, next: string): string | null {
  const a = prev.trim();
  const b = next.trim();
  if (!a || !b) return null;

  const aUpper = a.toUpperCase();
  const prefixes = EMPLOYEE_BADGE_QR_PREFIXES;

  for (const prefix of prefixes) {
    if (new RegExp(`^${prefix}:?$`, "i").test(a) && /^:?\d{4,}$/.test(b)) {
      return `${prefix}:${b.replace(/^:/, "")}`;
    }
    if (
      prefix.length > aUpper.length &&
      prefix.startsWith(aUpper) &&
      aUpper.length >= 3
    ) {
      const rest = prefix.slice(aUpper.length);
      const restRe = new RegExp(`^${rest}:?\\d{4,}$`, "i");
      if (restRe.test(b)) {
        return `${prefix}:${b.replace(new RegExp(`^${rest}:?`, "i"), "")}`;
      }
    }
  }

  // FR-0129 + -L02-OS-1/2
  if (/^[A-Z]{2,}-\d{4}$/i.test(a) && /^-/i.test(b)) {
    return `${a}${b}`;
  }

  // Generic incomplete + continuation
  if (looksLikePartialScanFragment(a) && (b.startsWith("-") || b.startsWith(":"))) {
    if (a.endsWith(":") && b.startsWith(":")) return `${a}${b.slice(1)}`;
    return `${a}${b}`;
  }

  return null;
}
