import { normalizeEmailList, readSupplierContactsSync } from "@/lib/data/supplier-contacts";
import { extractPoNumbers, parseSupplierEmailContent } from "@/lib/email/inbound/parse-supplier-email";
import { listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";

/** Fabric supplier domains recognised by the inbox scanner and reply list. */
export const KNOWN_SUPPLIER_INBOX_DOMAINS = [
  "loropiana.com",
  "zegna.com",
  "stylbiella.it",
  "drapersitaly.it",
  "caccioppolinapoli.it",
  "comoluxuryfabrics.com",
  "gazaba.com",
] as const;

const KNOWN_SUPPLIER_INBOX_DOMAIN_SET = new Set<string>(KNOWN_SUPPLIER_INBOX_DOMAINS);

export function normalizeEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

export function extractEmailDomain(address: string): string | null {
  const email = normalizeEmailAddress(address);
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain.length > 0 ? domain : null;
}

function isExactSupplierContactEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  for (const supplier of readSupplierContactsSync().suppliers) {
    const addresses = normalizeEmailList(supplier.emails, supplier.email);
    if (addresses.some((item) => item.toLowerCase() === normalized)) {
      return true;
    }
  }
  return false;
}

function supplierIdsForKnownDomain(domain: string): Set<string> {
  const suppliers = new Set<string>();
  if (!KNOWN_SUPPLIER_INBOX_DOMAIN_SET.has(domain)) return suppliers;

  for (const supplier of readSupplierContactsSync().suppliers) {
    const domains = new Set<string>();
    for (const replyDomain of supplier.reply_domains ?? []) {
      const cleaned = replyDomain.replace(/^@/, "").trim().toLowerCase();
      if (cleaned) domains.add(cleaned);
    }
    if (domains.has(domain)) {
      suppliers.add(supplier.id);
    }
  }

  return suppliers;
}

export function isKnownSupplierInboxDomain(domain: string): boolean {
  const cleaned = domain.replace(/^@/, "").trim().toLowerCase();
  return cleaned.length > 0 && KNOWN_SUPPLIER_INBOX_DOMAIN_SET.has(cleaned);
}

/**
 * Domains used for IMAP `from:` searches — any colleague at the mill can reply.
 */
export function getSupplierInboxSearchDomains(): string[] {
  return [...KNOWN_SUPPLIER_INBOX_DOMAINS];
}

/** Exact supplier contact emails used for IMAP `from:` searches (e.g. personal Gmail). */
export function getSupplierInboxSearchEmails(): string[] {
  const emails = new Set<string>();
  for (const supplier of readSupplierContactsSync().suppliers) {
    for (const email of normalizeEmailList(supplier.emails, supplier.email)) {
      emails.add(email.toLowerCase());
    }
  }
  return [...emails].sort();
}

/**
 * Match a supplier from the sender address:
 * 1. Exact email in contacts (orders@, valentina.cao@, vittorio.prossimo@gmail.com, etc.)
 * 2. Known supplier domain when only one mill uses that domain
 *    (e.g. anyone @loropiana.com → Loro Piana when unambiguous)
 */
export function findSupplierIdByEmail(fromAddress: string): string | null {
  const email = normalizeEmailAddress(fromAddress);
  if (!email) return null;

  const exactMatches: string[] = [];
  for (const supplier of readSupplierContactsSync().suppliers) {
    const addresses = normalizeEmailList(supplier.emails, supplier.email);
    if (addresses.some((item) => item.toLowerCase() === email)) {
      exactMatches.push(supplier.id);
    }
  }
  if (exactMatches.length === 1) return exactMatches[0];

  const domain = extractEmailDomain(email);
  if (!domain || !isKnownSupplierInboxDomain(domain)) return null;

  const suppliers = supplierIdsForKnownDomain(domain);
  if (suppliers.size === 1) {
    return [...suppliers][0];
  }

  return null;
}

/** Whether the sender is on an allowlisted supplier domain or an exact contact email. */
export function isKnownSupplierSender(fromAddress: string): boolean {
  const email = normalizeEmailAddress(fromAddress);
  if (!email) return false;
  if (isExactSupplierContactEmail(email)) return true;

  const domain = extractEmailDomain(email);
  return domain ? isKnownSupplierInboxDomain(domain) : false;
}

export function supplierNameForEmail(fromAddress: string): string | null {
  const supplierId = findSupplierIdByEmail(fromAddress);
  if (!supplierId) return null;
  return readSupplierContactsSync().suppliers.find((supplier) => supplier.id === supplierId)?.name ?? null;
}

export function hasMatchedFabricPoNumber(subject: string, body: string): boolean {
  const sentPoNumbers = new Set(listStoredFabricOrders().map((order) => order.po_number.toUpperCase()));
  const mentioned = extractPoNumbers(`${subject}\n${body}`);
  return mentioned.some((po) => sentPoNumbers.has(po));
}

/** Fabric/shipment signals — excludes generic commercial "invoice" / "document" subjects. */
export function hasSupplierReplyContextSignals(
  subject: string,
  body: string,
  hasPdf: boolean
): boolean {
  const parsed = parseSupplierEmailContent(subject, body);
  if (parsed.awb_numbers.length > 0) return true;
  if (parsed.invoice_numbers.length > 0) return true;

  const combined = `${subject}\n${body}`;
  if (
    /fabric|textile|cloth|yarn|swatch|article|composition|lot\s*#|colou?r|meter|metre|availability|out of stock|restock|substitut/i.test(
      combined
    )
  ) {
    return true;
  }

  const subjectLower = subject.toLowerCase();
  if (
    /proforma|fattura|packing list|packing slip|ddt|delivery note|waybill|awb|dispatch|shipment|spedizione|credit note|nota di credito|order confirmation|bol|bill of lading/.test(
      subjectLower
    )
  ) {
    return true;
  }

  if (hasPdf && /proforma|fattura|packing|shipment|dispatch|waybill|awb|spedizione/.test(subjectLower)) {
    return true;
  }

  return false;
}

/**
 * Whether an inbound email should be imported as a supplier reply during inbox scan.
 * Only allowlisted supplier domains and exact contact emails are accepted.
 */
export function shouldImportSupplierReply(fromAddress: string): boolean {
  return isKnownSupplierSender(fromAddress);
}
