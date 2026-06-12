import { normalizeEmailList, readSupplierContactsSync } from "@/lib/data/supplier-contacts";
import { extractPoNumbers, parseSupplierEmailContent } from "@/lib/email/inbound/parse-supplier-email";
import { listStoredFabricOrders } from "@/lib/integrations/fabric-order-store";

/** Personal mail domains — never treat as a fabric supplier on domain alone. */
const GENERIC_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);

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

function supplierDomainsFromContacts(): Map<string, Set<string>> {
  const domainSuppliers = new Map<string, Set<string>>();

  for (const supplier of readSupplierContactsSync().suppliers) {
    const domains = new Set<string>();

    for (const domain of supplier.reply_domains ?? []) {
      const cleaned = domain.replace(/^@/, "").trim().toLowerCase();
      if (cleaned) domains.add(cleaned);
    }

    for (const email of normalizeEmailList(supplier.emails, supplier.email)) {
      const domain = extractEmailDomain(email);
      if (domain && !GENERIC_MAIL_DOMAINS.has(domain)) {
        domains.add(domain);
      }
    }

    for (const domain of domains) {
      const bucket = domainSuppliers.get(domain) ?? new Set<string>();
      bucket.add(supplier.id);
      domainSuppliers.set(domain, bucket);
    }
  }

  return domainSuppliers;
}

function allRegisteredReplyDomains(): Set<string> {
  const domains = new Set<string>();
  for (const supplier of readSupplierContactsSync().suppliers) {
    for (const domain of supplier.reply_domains ?? []) {
      const cleaned = domain.replace(/^@/, "").trim().toLowerCase();
      if (cleaned) domains.add(cleaned);
    }
  }
  return domains;
}

export function isRegisteredSupplierReplyDomain(domain: string): boolean {
  const cleaned = domain.replace(/^@/, "").trim().toLowerCase();
  if (!cleaned || GENERIC_MAIL_DOMAINS.has(cleaned)) return false;
  if (allRegisteredReplyDomains().has(cleaned)) return true;
  const suppliers = supplierDomainsFromContacts().get(cleaned);
  return Boolean(suppliers && suppliers.size === 1);
}

/**
 * Domains used for IMAP `from:` searches — any colleague at the mill can reply.
 * Includes explicit reply_domains plus supplier-exclusive domains from contacts.
 */
export function getSupplierInboxSearchDomains(): string[] {
  const domainSuppliers = supplierDomainsFromContacts();
  const domains = new Set<string>();

  for (const supplier of readSupplierContactsSync().suppliers) {
    for (const domain of supplier.reply_domains ?? []) {
      const cleaned = domain.replace(/^@/, "").trim().toLowerCase();
      if (cleaned) domains.add(cleaned);
    }
  }

  for (const [domain, suppliers] of domainSuppliers) {
    if (suppliers.size === 1 && !GENERIC_MAIL_DOMAINS.has(domain)) {
      domains.add(domain);
    }
  }

  return [...domains].sort();
}

/**
 * Match a supplier from the sender address:
 * 1. Exact email in contacts (orders@, valentina.cao@, etc.)
 * 2. Known supplier domain when only one mill uses that domain
 *    (e.g. anyone @loropiana.com → Loro Piana)
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
  if (!domain || GENERIC_MAIL_DOMAINS.has(domain)) return null;

  const suppliers = supplierDomainsFromContacts().get(domain);
  if (suppliers?.size === 1) {
    return [...suppliers][0];
  }

  return null;
}

export function isKnownSupplierSender(fromAddress: string): boolean {
  if (findSupplierIdByEmail(fromAddress)) return true;
  const domain = extractEmailDomain(fromAddress);
  return domain ? isRegisteredSupplierReplyDomain(domain) : false;
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
 * Known supplier domains/addresses are trusted; unknown senders need a matched fabric PO
 * plus fabric/shipment context (not generic commercial invoice/statement subjects).
 */
export function shouldImportSupplierReply(
  fromAddress: string,
  subject: string,
  body: string,
  hasPdf: boolean
): boolean {
  if (isKnownSupplierSender(fromAddress)) return true;
  if (!hasMatchedFabricPoNumber(subject, body)) return false;
  return hasSupplierReplyContextSignals(subject, body, hasPdf);
}
