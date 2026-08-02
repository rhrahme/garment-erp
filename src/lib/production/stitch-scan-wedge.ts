/**
 * USB HID wedge scanners type characters very quickly. Distinguishing that from
 * slow human typing lets the stitch kiosk steal scan keystrokes even when a
 * search box has focus or text is selected - the previous capture layer dropped
 * those silently.
 */

/** Keys that finish a wedge scan (scanner suffix config). */
export function isWedgeTerminatorKey(key: string): boolean {
  return key === "Enter" || key === "Tab";
}

/**
 * Steal this keystroke as scanner input?
 * - Already buffering a scan -> always continue
 * - Rapid follow-up after another key -> scanner burst (even over inputs)
 * - Not in a marked manual-entry field -> always capture on the kiosk
 */
export function shouldStealKeyAsWedge(opts: {
  alreadyBuffering: boolean;
  gapMs: number;
  rapidGapMs: number;
  inManualEntryField: boolean;
}): boolean {
  if (opts.alreadyBuffering) return true;
  if (opts.gapMs > 0 && opts.gapMs < opts.rapidGapMs) return true;
  if (!opts.inManualEntryField) return true;
  return false;
}
