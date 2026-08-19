/**
 * USB wedge scanners sometimes pause mid-code long enough that an aggressive
 * idle flush splits one QR into fragments (FR-0129 + -L02-OS-1/2, EMP + :id,
 * EMPALT / EMPIRON / EMPBTN / EMPWASH + :id). These helpers detect and reassemble those
 * fragments.
 */

/** Incomplete EMP* badge prefixes the wedge may flush alone. */
function looksLikePartialEmployeeBadgePrefix(code: string): boolean {
  const c = code.trim();
  // EMP / EMP: / EMPA..EMPALT: / EMPI..EMPIRON: / EMPB..EMPBTN: / EMPW..EMPWASH:
  if (/^EMP(?:A(?:L(?:T)?)?)?:?$/i.test(c)) return true;
  if (/^EMP(?:I(?:R(?:O(?:N)?)?)?)?:?$/i.test(c)) return true;
  if (/^EMP(?:B(?:T(?:N)?)?)?:?$/i.test(c)) return true;
  if (/^EMP(?:W(?:A(?:S(?:H)?)?)?)?:?$/i.test(c)) return true;
  return false;
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

  // Longest EMP* prefixes before EMP -- EMP is a prefix of EMPIRON / EMPBTN / EMPALT / EMPWASH.

  // EMPWASH + :id / EMPWASH: + id / EMPWASH + id
  if (/^EMPWASH:?$/i.test(a) && /^:?\d{4,}$/.test(b)) {
    return `EMPWASH:${b.replace(/^:/, "")}`;
  }
  if (/^EMPWAS$/i.test(a) && /^H:?\d{4,}$/i.test(b)) {
    return `EMPWASH:${b.replace(/^H:?/i, "")}`;
  }
  if (/^EMPWA$/i.test(a) && /^SH:?\d{4,}$/i.test(b)) {
    return `EMPWASH:${b.replace(/^SH:?/i, "")}`;
  }
  if (/^EMPW$/i.test(a) && /^ASH:?\d{4,}$/i.test(b)) {
    return `EMPWASH:${b.replace(/^ASH:?/i, "")}`;
  }
  if (/^EMP$/i.test(a) && /^WASH:?\d{4,}$/i.test(b)) {
    return `EMPWASH:${b.replace(/^WASH:?/i, "")}`;
  }

  // EMPIRON + :id / EMPIRON: + id / EMPIRON + id
  if (/^EMPIRON:?$/i.test(a) && /^:?\d{4,}$/.test(b)) {
    return `EMPIRON:${b.replace(/^:/, "")}`;
  }
  // Mid-prefix EMPIR + ON:id / EMPI + RON:id / EMP + IRON:id
  if (/^EMPIR$/i.test(a) && /^ON:?\d{4,}$/i.test(b)) {
    return `EMPIRON:${b.replace(/^ON:?/i, "")}`;
  }
  if (/^EMPI$/i.test(a) && /^RON:?\d{4,}$/i.test(b)) {
    return `EMPIRON:${b.replace(/^RON:?/i, "")}`;
  }
  if (/^EMP$/i.test(a) && /^IRON:?\d{4,}$/i.test(b)) {
    return `EMPIRON:${b.replace(/^IRON:?/i, "")}`;
  }

  // EMPBTN + :id / EMPBTN: + id / EMPBTN + id
  if (/^EMPBTN:?$/i.test(a) && /^:?\d{4,}$/.test(b)) {
    return `EMPBTN:${b.replace(/^:/, "")}`;
  }
  if (/^EMPBT$/i.test(a) && /^N:?\d{4,}$/i.test(b)) {
    return `EMPBTN:${b.replace(/^N:?/i, "")}`;
  }
  if (/^EMPB$/i.test(a) && /^TN:?\d{4,}$/i.test(b)) {
    return `EMPBTN:${b.replace(/^TN:?/i, "")}`;
  }
  if (/^EMP$/i.test(a) && /^BTN:?\d{4,}$/i.test(b)) {
    return `EMPBTN:${b.replace(/^BTN:?/i, "")}`;
  }

  // EMPALT + :id / EMPALT: + id / EMPALT + id
  if (/^EMPALT:?$/i.test(a) && /^:?\d{4,}$/.test(b)) {
    return `EMPALT:${b.replace(/^:/, "")}`;
  }

  // Mid-prefix EMPAL + T:2613... / EMPA + LT:2613... / EMP + ALT:2613...
  if (/^EMPAL$/i.test(a) && /^T:?\d{4,}$/i.test(b)) {
    return `EMPALT:${b.replace(/^T:?/i, "")}`;
  }
  if (/^EMPA$/i.test(a) && /^LT:?\d{4,}$/i.test(b)) {
    return `EMPALT:${b.replace(/^LT:?/i, "")}`;
  }
  if (/^EMP$/i.test(a) && /^ALT:?\d{4,}$/i.test(b)) {
    return `EMPALT:${b.replace(/^ALT:?/i, "")}`;
  }

  // EMP + :2613429014  /  EMP: + 2613429014  /  EMP + 2613429014
  if (/^EMP:?$/i.test(a) && /^:?\d{4,}$/.test(b)) {
    return `EMP:${b.replace(/^:/, "")}`;
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
