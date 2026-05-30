/** Default inbox scan window — override via POST body or env */
export const INBOX_SCAN_DAYS_DEFAULT = Number(process.env.INBOX_SCAN_DAYS ?? 180);
export const INBOX_SCAN_LIMIT_DEFAULT = Number(process.env.INBOX_SCAN_LIMIT ?? 400);

export type InboxScanOptions = {
  days?: number;
  limit?: number;
};

export function resolveInboxScanOptions(options: InboxScanOptions = {}): {
  days: number;
  limit: number;
} {
  const days = Math.min(Math.max(options.days ?? INBOX_SCAN_DAYS_DEFAULT, 7), 730);
  const limit = Math.min(Math.max(options.limit ?? INBOX_SCAN_LIMIT_DEFAULT, 20), 2000);
  return { days, limit };
}

export function looksLikeSupplierInvoiceSubject(subject: string, hasPdf: boolean): boolean {
  const subjectLower = subject.toLowerCase();
  if (
    /invoice|fattura|proforma|ddt|delivery note|packing list|packing slip|spedizione|shipment|shipped|document|bol|bill of lading|credit note|nota di credito|order confirmation|dispatch|dispatched|awb|waybill/.test(
      subjectLower
    )
  ) {
    return true;
  }
  return hasPdf && /order|fabric|document|attached|enclosed|as of \d/.test(subjectLower);
}
