import { extractAwbNumbers } from "@/lib/email/inbound/parse-supplier-email";
import { normalizeScannerInput } from "@/lib/production/scan-input";

const STICKER_PREFIX = /^(FR|GL|PL|WO|SO)-/i;

/** Turn USB scanner / QR payload into a single AWB number, or null if not AWB-like. */
export function normalizeAwbScanInput(raw: string): string | null {
  const cleaned = normalizeScannerInput(raw);
  if (!cleaned) return null;

  if (STICKER_PREFIX.test(cleaned)) return null;

  const extracted = extractAwbNumbers(cleaned);
  if (extracted.length > 0) return extracted[0]!;

  const compact = cleaned.replace(/\s+/g, "");

  if (/^[0-9]{10,11}$/.test(compact)) return compact;
  if (/^[0-9]{3}-[0-9]{8,9}$/.test(compact)) return compact;
  if (/^JJD[0-9A-Z]{10,}$/i.test(compact)) return compact.toUpperCase();
  if (/^JVGL[0-9A-Z]{10,}$/i.test(compact)) return compact.toUpperCase();

  if (/^[A-Z0-9-]{8,25}$/i.test(compact) && /\d{8,}/.test(compact)) {
    return compact.toUpperCase();
  }

  return null;
}
