import fs from "fs";
import path from "path";
import crypto from "crypto";
import { readJsonFile, writeJsonFile } from "@/lib/data/json-file-cache";
import { listSupplierInvoices, type SupplierInvoiceRecord } from "@/lib/integrations/supplier-invoice-store";

const STORE_PATH = path.join(process.cwd(), "transporter-invoices.local.json");
const FILES_DIR = path.join(process.cwd(), "supplier-invoices", "transporter-files");

export type TransporterExpenseType = "customs" | "freight" | "other";

export interface TransporterInvoiceRecord {
  id: string;
  supplier_invoice_id: string | null;
  carrier: string;
  awb_number: string | null;
  invoice_number: string | null;
  expense_type: TransporterExpenseType;
  amount: string | null;
  currency: string | null;
  payment_url: string | null;
  subject: string;
  from_address: string;
  received_at: string;
  message_id: string | null;
  original_filename: string | null;
  stored_filename: string | null;
  file_size: number;
  source: "email_scan" | "manual_upload";
  created_at: string;
}

interface TransporterInvoiceStore {
  invoices: TransporterInvoiceRecord[];
}

function readStore(): TransporterInvoiceStore {
  return readJsonFile(STORE_PATH, { invoices: [] });
}

function writeStore(store: TransporterInvoiceStore): void {
  writeJsonFile(STORE_PATH, store);
}

function ensureFilesDir(): void {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

function dedupeKey(messageId: string | null, filename: string): string {
  return `${(messageId ?? "no-message").toLowerCase()}::${filename.toLowerCase()}`;
}

export function findSupplierInvoiceIdByAwb(awb: string | null | undefined): string | null {
  if (!awb) return null;
  const normalized = awb.trim();
  const match = listSupplierInvoices(500).find((invoice) =>
    invoice.awb_numbers.some((value) => value === normalized)
  );
  return match?.id ?? null;
}

export function listTransporterInvoices(limit = 500): TransporterInvoiceRecord[] {
  return readStore()
    .invoices.sort((a, b) => b.received_at.localeCompare(a.received_at))
    .slice(0, limit);
}

export function listTransporterInvoicesForSupplier(supplierInvoiceId: string): TransporterInvoiceRecord[] {
  return listTransporterInvoices().filter((invoice) => invoice.supplier_invoice_id === supplierInvoiceId);
}

export function getTransporterInvoice(id: string): TransporterInvoiceRecord | undefined {
  return readStore().invoices.find((invoice) => invoice.id === id);
}

export function getTransporterInvoiceFilePath(invoice: TransporterInvoiceRecord): string | null {
  if (!invoice.stored_filename) return null;
  return path.join(FILES_DIR, invoice.stored_filename);
}

export function attachTransporterInvoicesToSuppliers(
  supplierInvoices: SupplierInvoiceRecord[]
): Array<SupplierInvoiceRecord & { transporter_invoices: TransporterInvoiceRecord[] }> {
  const all = listTransporterInvoices();
  return supplierInvoices.map((invoice) => ({
    ...invoice,
    transporter_invoices: all.filter((doc) => doc.supplier_invoice_id === invoice.id),
  }));
}

export function saveTransporterInvoiceFile(input: {
  supplier_invoice_id?: string | null;
  carrier: string;
  awb_number: string | null;
  invoice_number: string | null;
  expense_type: TransporterExpenseType;
  amount: string | null;
  currency: string | null;
  payment_url: string | null;
  subject: string;
  from_address: string;
  received_at: string;
  message_id: string | null;
  original_filename: string | null;
  content?: Buffer | null;
  source: "email_scan" | "manual_upload";
}): TransporterInvoiceRecord | null {
  const hasFile = Boolean(input.content?.length);
  if (!hasFile && !input.payment_url && !input.amount && !input.awb_number) return null;

  ensureFilesDir();

  const store = readStore();
  const dedupe = dedupeKey(input.message_id, input.original_filename ?? "payment-link");
  const existing = store.invoices.find(
    (invoice) => dedupeKey(invoice.message_id, invoice.original_filename ?? "payment-link") === dedupe
  );
  if (existing) return existing;

  const supplierInvoiceId =
    input.supplier_invoice_id ?? findSupplierInvoiceIdByAwb(input.awb_number);

  const id = `tinv-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  let stored_filename: string | null = null;
  let file_size = 0;

  if (hasFile && input.content) {
    const safeBase = (input.original_filename ?? "invoice.pdf")
      .replace(/[^\w.-]+/g, "_")
      .replace(/_+/g, "_");
    stored_filename = `${id}-${safeBase}`;
    fs.writeFileSync(path.join(FILES_DIR, stored_filename), input.content);
    file_size = input.content.length;
  }

  const record: TransporterInvoiceRecord = {
    id,
    supplier_invoice_id: supplierInvoiceId,
    carrier: input.carrier,
    awb_number: input.awb_number,
    invoice_number: input.invoice_number,
    expense_type: input.expense_type,
    amount: input.amount,
    currency: input.currency,
    payment_url: input.payment_url,
    subject: input.subject,
    from_address: input.from_address,
    received_at: input.received_at,
    message_id: input.message_id,
    original_filename: input.original_filename,
    stored_filename,
    file_size,
    source: input.source,
    created_at: new Date().toISOString(),
  };

  store.invoices.unshift(record);
  writeStore(store);
  return record;
}

export function relinkTransporterInvoicesByAwb(): number {
  const store = readStore();
  let updated = 0;

  for (const invoice of store.invoices) {
    if (invoice.supplier_invoice_id || !invoice.awb_number) continue;
    const linked = findSupplierInvoiceIdByAwb(invoice.awb_number);
    if (linked) {
      invoice.supplier_invoice_id = linked;
      updated += 1;
    }
  }

  if (updated > 0) writeStore(store);
  return updated;
}
