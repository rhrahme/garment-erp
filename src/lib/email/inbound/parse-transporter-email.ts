import { extractAwbNumbers, extractInvoiceNumbers, detectCarrier } from "@/lib/email/inbound/parse-supplier-email";

/** DHL Advance Duty Collection — customs invoices & payment links */
export const DHL_ADC_SENDER = "no-reply.adc@dhl.com";

/** DHL Express payment confirmation receipts (after customs paid) */
export const DHL_PAYMENT_RECEIPT_SENDER = "noreply@dhl.com";
export const DHL_PAYMENT_RECEIPT_SUBJECT = /dhl express payment receipt/i;

export const KNOWN_CARRIER_SENDERS = new Set<string>([
  DHL_ADC_SENDER,
]);

export type ParsedTransporterEmail = {
  carrier: string;
  awb_numbers: string[];
  invoice_numbers: string[];
  expense_type: "customs" | "freight" | "other";
  amount: string | null;
  currency: string | null;
  payment_url: string | null;
};

const CARRIER_FROM_PATTERNS = [
  /@(?:[\w.-]+\.)?dhl\.(?:com|de|net|co\.uk)/i,
  /@dhlexpress\.com/i,
  /@dhlecommerce\.com/i,
  /@fedex\.com/i,
  /@ups\.com/i,
  /@tnt\.com/i,
  /@mydhl\.com/i,
  /@dhl\.(?:com|de)/i,
];

const TRANSPORTER_SIGNAL =
  /customs?|import duty|import charge|clearance|payment due|pay now|outstanding|demurrage|brokerage|duties and taxes|import fees|shipping invoice|freight invoice|express invoice|duty invoice|advance duty|duty and tax|support documentation|adc invoice|payment receipt|express payment/i;

const PAYMENT_URL_PATTERNS = [
  /https?:\/\/(?:pay\.|mybill\.|adc\.)?dhl[^\s"'<>)]+/gi,
  /https?:\/\/[^\s"'<>]*(?:pay|payment|invoice|customs|duty|adc)[^\s"'<>]*/gi,
];

const AMOUNT_PATTERNS = [
  /\b(USD|EUR|GBP|AED|SAR)\s*([0-9][0-9,]*(?:\.[0-9]{2})?)\b/i,
  /\b([0-9][0-9,]*(?:\.[0-9]{2})?)\s*(USD|EUR|GBP|AED|SAR)\b/i,
  /\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/,
  /€\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/,
];

function normalizeAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

export function isKnownCarrierSender(fromAddress: string): boolean {
  const email = normalizeAddress(fromAddress);
  return KNOWN_CARRIER_SENDERS.has(email);
}

export function isDhlAdcSender(fromAddress: string): boolean {
  return normalizeAddress(fromAddress) === DHL_ADC_SENDER;
}

export function isDhlPaymentReceiptEmail(fromAddress: string, subject: string): boolean {
  return (
    normalizeAddress(fromAddress) === DHL_PAYMENT_RECEIPT_SENDER &&
    DHL_PAYMENT_RECEIPT_SUBJECT.test(subject)
  );
}

/** Known senders or sender+subject rules that should always be scanned */
export function isTrustedTransporterSource(fromAddress: string, subject: string): boolean {
  return isKnownCarrierSender(fromAddress) || isDhlPaymentReceiptEmail(fromAddress, subject);
}

export function isDhlTransporterEmail(fromAddress: string, subject: string): boolean {
  return isDhlAdcSender(fromAddress) || isDhlPaymentReceiptEmail(fromAddress, subject);
}

export function isCarrierEmailAddress(fromAddress: string): boolean {
  if (isKnownCarrierSender(fromAddress)) return true;
  const email = normalizeAddress(fromAddress);
  return CARRIER_FROM_PATTERNS.some((pattern) => pattern.test(email));
}

/** Domains for IMAP `from:` searches — customs/freight invoices from carriers. */
export function getTransporterSearchDomains(): string[] {
  return ["dhl.com", "fedex.com", "ups.com", "tnt.com", "dhlexpress.com", "mydhl.com"];
}

export function isRelevantTransporterEmail(
  fromAddress: string,
  subject: string,
  body: string,
  hasPdfAttachment: boolean
): boolean {
  if (isTrustedTransporterSource(fromAddress, subject)) return true;

  const combined = `${subject}\n${body}`.toLowerCase();
  const fromCarrier = isCarrierEmailAddress(fromAddress);
  const hasTransporterSignal = TRANSPORTER_SIGNAL.test(`${subject}\n${body}`);

  if (fromCarrier && (hasPdfAttachment || hasTransporterSignal || /invoice|payment|charge|duty/.test(combined))) {
    return true;
  }

  if (hasTransporterSignal && /dhl|fedex|ups|tnt|express/.test(combined) && hasPdfAttachment) {
    return true;
  }

  return false;
}

export function isTransporterPdfAttachment(
  filename: string,
  subject: string,
  fromAddress: string
): boolean {
  if (!/\.pdf$/i.test(filename)) return false;
  if (
    isTrustedTransporterSource(fromAddress, subject) ||
    isCarrierEmailAddress(fromAddress)
  ) {
    return true;
  }

  const haystack = `${filename}\n${subject}`.toLowerCase();
  return /customs|duty|dhl|fedex|ups|freight|clearance|import|charge|invoice/.test(haystack);
}

function extractPaymentUrl(text: string): string | null {
  for (const pattern of PAYMENT_URL_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[0]) {
      return match[0].replace(/[),.;]+$/, "");
    }
  }
  return null;
}

function extractAmount(text: string): { amount: string | null; currency: string | null } {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    if (match[1] && /^[A-Z]{3}$/i.test(match[1])) {
      return { currency: match[1].toUpperCase(), amount: match[2]?.replace(/,/g, "") ?? null };
    }
    if (match[2] && /^[A-Z]{3}$/i.test(match[2])) {
      return { currency: match[2].toUpperCase(), amount: match[1]?.replace(/,/g, "") ?? null };
    }
    if (match[0].startsWith("$")) {
      return { currency: "USD", amount: match[1]?.replace(/,/g, "") ?? null };
    }
    if (match[0].startsWith("€")) {
      return { currency: "EUR", amount: match[1]?.replace(/,/g, "") ?? null };
    }
  }
  return { amount: null, currency: null };
}

function detectExpenseType(subject: string, body: string, fromAddress: string): "customs" | "freight" | "other" {
  if (isDhlTransporterEmail(fromAddress, subject)) return "customs";

  const haystack = `${subject}\n${body}`.toLowerCase();
  if (/customs?|import duty|duty|clearance|brokerage|duties and taxes|import charge|import fee/.test(haystack)) {
    return "customs";
  }
  if (/freight|shipping|express|transport|delivery charge/.test(haystack)) {
    return "freight";
  }
  return "other";
}

export function parseTransporterEmailContent(
  subject: string,
  body: string,
  fromAddress: string
): ParsedTransporterEmail {
  const combined = `${subject}\n${body}`;
  const awb_numbers = extractAwbNumbers(combined);
  const invoice_numbers = extractInvoiceNumbers(combined);
  const { amount, currency } = extractAmount(combined);

  return {
    carrier: isDhlTransporterEmail(fromAddress, subject) ? "DHL" : detectCarrier(combined, awb_numbers),
    awb_numbers,
    invoice_numbers,
    expense_type: detectExpenseType(subject, body, fromAddress),
    amount,
    currency,
    payment_url: extractPaymentUrl(combined),
  };
}
