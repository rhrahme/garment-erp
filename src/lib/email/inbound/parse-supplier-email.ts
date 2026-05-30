const PO_NUMBER_PATTERN = /PO-\d{4}-\d{4}/gi;

const AWB_PATTERNS = [
  /\btracking\s+(?:number|no\.?|#)\s*:?\s*([0-9]{10,11})\b/gi,
  /\b(?:waybill|awb)\s+(?:number|no\.?|#)\s*:?\s*([0-9A-Z-]{8,25})\b/gi,
  /\bAWB[\s#:.-]*([A-Z0-9-]{8,25})\b/gi,
  /\bDHL[\s#:.-]*([0-9]{10,11})\b/gi,
  /\b([0-9]{3}-[0-9]{8,9})\b/g,
  /\b(JJD[0-9A-Z]{10,})\b/gi,
  /\b(JVGL[0-9A-Z]{10,})\b/gi,
];

const INVOICE_PATTERNS = [
  /\binvoice[\s#:.-]*([A-Z0-9][A-Z0-9/-]{3,24})\b/gi,
  /\binv[\s#:.-]*([A-Z0-9][A-Z0-9/-]{3,24})\b/gi,
  /\bfattura[\s#:.-]*([A-Z0-9][A-Z0-9/-]{3,24})\b/gi,
  /\bproforma[\s#:.-]*([A-Z0-9][A-Z0-9/-]{3,24})\b/gi,
  /\bInvoice\s+[\dA-Z-]+\s+(\d{6,})\b/gi,
];

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractMatches(text: string, patterns: RegExp[]): string[] {
  const found: string[] = [];
  for (const pattern of patterns) {
    const flags = pattern.flags;
    const regex = new RegExp(pattern.source, flags.includes("g") ? flags : `${flags}g`);
    for (const match of text.matchAll(regex)) {
      const value = (match[1] ?? match[0]).trim();
      if (value.length >= 4) found.push(value);
    }
  }
  return found;
}

export function extractPoNumbers(text: string): string[] {
  const matches = text.match(PO_NUMBER_PATTERN) ?? [];
  return unique(matches.map((value) => value.toUpperCase()));
}

import { isLikelyPhoneNumber } from "@/lib/email/inbound/parse-invoice-pdf";

export function extractAwbNumbers(text: string): string[] {
  const candidates = extractMatches(text, AWB_PATTERNS);
  const normalizedText = text.replace(/\s+/g, "");
  return unique(
    candidates.filter((value) => {
      const compact = value.replace(/\s+/g, "");
      if (/^PO-\d{4}-\d{4}$/i.test(compact)) return false;
      if (/^INV/i.test(compact)) return false;
      if (!/\d{8,}/.test(compact)) return false;
      if (/^tracking\d*$/i.test(compact)) return false;
      if (isLikelyPhoneNumber(compact, text)) return false;
      if (
        normalizedText.includes(`tel:+${compact}`) ||
        normalizedText.includes(`tel:${compact}`) ||
        normalizedText.includes(`tel:+39${compact.replace(/^39/, "")}`)
      ) {
        return false;
      }
      return compact.length >= 8;
    })
  );
}

export function extractInvoiceNumbers(text: string): string[] {
  const INVOICE_STOPWORDS = new Set(["iato", "also", "would", "oice", "inv", "invoice", "fattura", "2026-v1"]);
  return unique(
    extractMatches(text, INVOICE_PATTERNS).filter((value) => {
      const normalized = value.toLowerCase();
      if (INVOICE_STOPWORDS.has(normalized)) return false;
      if (normalized.length < 5) return false;
      return /[0-9]/.test(value);
    })
  );
}

export function detectCarrier(text: string, awbNumbers: string[]): string {
  const haystack = `${text}\n${awbNumbers.join("\n")}`.toLowerCase();
  if (haystack.includes("dhl")) return "DHL";
  if (haystack.includes("fedex")) return "FedEx";
  if (haystack.includes("ups")) return "UPS";
  if (haystack.includes("tnt")) return "TNT";
  if (haystack.includes("brt")) return "BRT";
  return "DHL";
}

export type ParsedSupplierEmail = {
  po_numbers: string[];
  awb_numbers: string[];
  invoice_numbers: string[];
  carrier: string;
};

export function parseSupplierEmailContent(subject: string, body: string): ParsedSupplierEmail {
  const combined = `${subject}\n${body}`;
  const awb_numbers = extractAwbNumbers(combined);
  return {
    po_numbers: extractPoNumbers(combined),
    awb_numbers,
    invoice_numbers: extractInvoiceNumbers(combined),
    carrier: detectCarrier(combined, awb_numbers),
  };
}
