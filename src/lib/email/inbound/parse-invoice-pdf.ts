import {
  extractCustomsInvoiceTotal,
  extractSupplierInvoiceTotal,
} from "@/lib/email/inbound/parse-invoice-amount";

export type EmailAttachmentInput = {
  filename: string;
  content: Buffer;
  contentType?: string | null;
};

const DHL_INVOICE_AWB_PATTERNS = [
  /\b(?:AWB|A\.W\.B\.|Air\s*Way\s*Bill|Waybill|Lettera\s+di\s+vettura|Vettura)[\s#:.-]*([0-9]{10,11})\b/gi,
  /\bDHL[\s#:.-]*([0-9]{10,11})\b/gi,
  /\b(JJD[0-9A-Z]{10,})\b/gi,
  /\b(JVGL[0-9A-Z]{10,})\b/gi,
  /\b([0-9]{3}-[0-9]{8,9})\b/g,
  /\bDHL\b[\s\S]{0,120}?\b([0-9]{10})\b/gi,
  /\b([0-9]{10})\b[\s\S]{0,120}?\bDHL\b/gi,
];

const PDF_INVOICE_NUMBER_PATTERNS = [
  /\b(?:Invoice|Fattura|Documento|Doc\.?\s*(?:No|Number)?|Numero\s+fattura)[\s#:.-]*([A-Z0-9][A-Z0-9/-]{3,24})\b/gi,
  /\b(?:Proforma)[\s#:.-]*([A-Z0-9][A-Z0-9/-]{3,24})\b/gi,
];

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractPatternMatches(text: string, patterns: RegExp[]): string[] {
  const found: string[] = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    for (const match of text.matchAll(regex)) {
      const value = (match[1] ?? match[0]).trim();
      if (value) found.push(value);
    }
  }
  return found;
}

export function isLikelyPhoneNumber(value: string, context: string): boolean {
  const compact = value.replace(/\D/g, "");
  if (/^39\d{9,10}$/.test(compact)) return true;

  const index = context.indexOf(compact);
  if (index >= 0) {
    const window = context.slice(Math.max(0, index - 40), index + compact.length + 20);
    if (/mob\.?|mobile|cellulare|cell\.?|tel\.?|phone|\+39/i.test(window)) return true;
  }

  return false;
}

export function extractDhlAwbFromInvoiceText(text: string): string[] {
  const candidates = extractPatternMatches(text, DHL_INVOICE_AWB_PATTERNS);
  return unique(
    candidates
      .map((value) => value.replace(/\s+/g, ""))
      .filter((compact) => {
        if (compact.length < 10) return false;
        if (isLikelyPhoneNumber(compact, text)) return false;
        if (/^tracking\d*$/i.test(compact)) return false;
        return /\d/.test(compact);
      })
  );
}

const INVOICE_STOPWORDS = new Set(["iato", "also", "would", "oice", "inv", "invoice", "fattura"]);

export function extractInvoiceNumbersFromPdfText(text: string): string[] {
  return unique(
    extractPatternMatches(text, PDF_INVOICE_NUMBER_PATTERNS).filter((value) => {
      const normalized = value.toLowerCase();
      if (INVOICE_STOPWORDS.has(normalized)) return false;
      if (normalized.length < 4) return false;
      return /[0-9]/.test(value);
    })
  );
}

export async function extractTextFromPdf(content: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: content });
    const result = await parser.getText();
    await parser.destroy();
    return result.text ?? "";
  } catch {
    return "";
  }
}

export async function parseInvoicePdfAttachment(
  attachment: EmailAttachmentInput
): Promise<{
  awb_numbers: string[];
  invoice_numbers: string[];
  amount: string | null;
  currency: string | null;
}> {
  if (!/\.pdf$/i.test(attachment.filename)) {
    return { awb_numbers: [], invoice_numbers: [], amount: null, currency: null };
  }

  const text = await extractTextFromPdf(attachment.content);
  if (!text.trim()) {
    return { awb_numbers: [], invoice_numbers: [], amount: null, currency: null };
  }

  const total = extractSupplierInvoiceTotal(text);
  const customsTotal = extractCustomsInvoiceTotal(text);

  return {
    awb_numbers: extractDhlAwbFromInvoiceText(text),
    invoice_numbers: extractInvoiceNumbersFromPdfText(text),
    amount: total?.amount ?? customsTotal?.amount ?? null,
    currency: total?.currency ?? customsTotal?.currency ?? null,
  };
}

export async function parseInvoiceAttachments(attachments: EmailAttachmentInput[]): Promise<{
  awb_numbers: string[];
  invoice_numbers: string[];
  amount: string | null;
  currency: string | null;
}> {
  const awb_numbers: string[] = [];
  const invoice_numbers: string[] = [];
  let amount: string | null = null;
  let currency: string | null = null;

  for (const attachment of attachments) {
    const parsed = await parseInvoicePdfAttachment(attachment);
    awb_numbers.push(...parsed.awb_numbers);
    invoice_numbers.push(...parsed.invoice_numbers);
    if (!amount && parsed.amount) {
      amount = parsed.amount;
      currency = parsed.currency;
    }
  }

  return {
    awb_numbers: unique(awb_numbers),
    invoice_numbers: unique(invoice_numbers),
    amount,
    currency,
  };
}
