/**
 * USB wedge scanners sometimes pause mid-code long enough that an aggressive
 * idle flush splits one QR into fragments (FR-0129 + -L02-OS-1/2, EMP + :id).
 * These helpers detect and reassemble those fragments.
 */

/** True when a flushed buffer looks like an incomplete wedge fragment. */
export function looksLikePartialScanFragment(code: string): boolean {
  const c = code.trim();
  if (!c) return true;
  if (c.length <= 2) return true;
  if (/^EMP:?$/i.test(c)) return true;
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
