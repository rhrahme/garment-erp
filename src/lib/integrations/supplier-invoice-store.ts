import path from "path";
import crypto from "crypto";
import {
  getLocalInvoiceFilesDir,
  readInvoiceFile,
  writeInvoiceFile,
} from "@/lib/data/invoice-file-storage";
import { readJsonFile, writeJsonFile } from "@/lib/data/json-file-cache";
import { findSupplierIdByEmail } from "@/lib/email/inbound/process-supplier-email";

const STORE_PATH = path.join(process.cwd(), "supplier-invoices.local.json");
const FILES_CATEGORY = "supplier" as const;

export interface SupplierInvoiceRecord {
  id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  amount: string | null;
  currency: string | null;
  awb_numbers: string[];
  po_number: string | null;
  subject: string;
  from_address: string;
  received_at: string;
  message_id: string | null;
  original_filename: string;
  stored_filename: string;
  file_size: number;
  created_at: string;
}

interface SupplierInvoiceStore {
  invoices: SupplierInvoiceRecord[];
}

function readStore(): SupplierInvoiceStore {
  return readJsonFile(STORE_PATH, { invoices: [] });
}

function writeStore(store: SupplierInvoiceStore): void {
  writeJsonFile(STORE_PATH, store);
}

function invoiceDedupeKey(messageId: string | null, filename: string): string {
  return `${(messageId ?? "no-message").toLowerCase()}::${filename.toLowerCase()}`;
}

export function listSupplierInvoices(limit = 200): SupplierInvoiceRecord[] {
  return readStore()
    .invoices.sort((a, b) => b.received_at.localeCompare(a.received_at))
    .slice(0, limit);
}

export function getSupplierInvoice(id: string): SupplierInvoiceRecord | undefined {
  return readStore().invoices.find((invoice) => invoice.id === id);
}

export function getSupplierInvoiceFilePath(invoice: SupplierInvoiceRecord): string {
  return path.join(getLocalInvoiceFilesDir(FILES_CATEGORY), invoice.stored_filename);
}

export async function readSupplierInvoiceFile(
  invoice: SupplierInvoiceRecord
): Promise<Buffer | null> {
  return readInvoiceFile(FILES_CATEGORY, invoice.stored_filename);
}

export async function saveSupplierInvoiceFile(input: {
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  amount?: string | null;
  currency?: string | null;
  awb_numbers: string[];
  po_number: string | null;
  subject: string;
  from_address: string;
  received_at: string;
  message_id: string | null;
  original_filename: string;
  content: Buffer;
}): Promise<SupplierInvoiceRecord | null> {
  if (!input.content.length) return null;

  const store = readStore();
  const dedupe = invoiceDedupeKey(input.message_id, input.original_filename);
  const existing = store.invoices.find(
    (invoice) => invoiceDedupeKey(invoice.message_id, invoice.original_filename) === dedupe
  );
  if (existing) return existing;

  const id = `inv-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const safeBase = input.original_filename.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_");
  const stored_filename = `${id}-${safeBase}`;

  await writeInvoiceFile(FILES_CATEGORY, stored_filename, input.content);

  const record: SupplierInvoiceRecord = {
    id,
    supplier_id: input.supplier_id,
    supplier_name: input.supplier_name,
    invoice_number: input.invoice_number,
    amount: input.amount ?? null,
    currency: input.currency ?? null,
    awb_numbers: input.awb_numbers,
    po_number: input.po_number,
    subject: input.subject,
    from_address: input.from_address,
    received_at: input.received_at,
    message_id: input.message_id,
    original_filename: input.original_filename,
    stored_filename,
    file_size: input.content.length,
    created_at: new Date().toISOString(),
  };

  store.invoices.unshift(record);
  writeStore(store);
  return record;
}

export function isInvoicePdfAttachment(
  filename: string,
  subject: string,
  fromKnownSupplier = false
): boolean {
  if (!/\.pdf$/i.test(filename)) return false;

  const haystack = `${filename}\n${subject}`.toLowerCase();
  if (/price\s*list|catalogue|catalog|listino|stocklist|stock list|pricelist|lookbook|swatch|cardex/.test(haystack)) {
    return false;
  }

  if (
    /invoice|fattura|proforma|credit note|nota di credito|ddt|delivery note|packing list|packing slip|document|spedizione|shipment|bol|waybill/.test(
      haystack
    )
  ) {
    return true;
  }

  if (fromKnownSupplier) {
    if (/^\d{5,}\.pdf$/i.test(filename)) return true;
    if (/inv|fatt|doc|ddt|ship|pack/i.test(filename)) return true;
    if (/invoice|fattura|shipped|spedizione|document|ddt|packing|order|shipment|attached|enclosed/i.test(subject)) {
      return true;
    }
  }

  return false;
}

export function pickInvoiceNumber(
  subject: string,
  candidates: string[]
): string | null {
  const subjectMatch = subject.match(/Invoice\s+[\dA-Z-]+\s+(\d{6,})/i);
  if (subjectMatch?.[1]) return subjectMatch[1];

  const numeric = candidates.find((value) => /^\d{5,}$/.test(value));
  if (numeric) return numeric;

  return candidates[0] ?? null;
}
