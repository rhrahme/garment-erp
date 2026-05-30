import fs from "fs";
import { extractTextFromPdf } from "@/lib/email/inbound/parse-invoice-pdf";
import {
  extractCustomsInvoiceTotal,
  extractSupplierInvoiceTotal,
} from "@/lib/email/inbound/parse-invoice-amount";
import {
  getSupplierInvoice,
  getSupplierInvoiceFilePath,
  listSupplierInvoices,
  type SupplierInvoiceRecord,
} from "@/lib/integrations/supplier-invoice-store";
import {
  getTransporterInvoiceFilePath,
  listTransporterInvoices,
  type TransporterInvoiceRecord,
} from "@/lib/integrations/transporter-invoice-store";

const STORE_PATH_SUFFIX = ".local.json";

function updateJsonStore<T extends { invoices: unknown[] }>(
  storePath: string,
  updater: (store: T) => boolean
): void {
  if (!fs.existsSync(storePath)) return;
  const store = JSON.parse(fs.readFileSync(storePath, "utf8")) as T;
  if (updater(store)) {
    fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  }
}

export async function enrichSupplierInvoiceAmounts(): Promise<number> {
  let updated = 0;
  const storePath = `${process.cwd()}/supplier-invoices${STORE_PATH_SUFFIX}`;

  for (const invoice of listSupplierInvoices(500)) {
    if (invoice.amount && invoice.currency) continue;

    const filePath = getSupplierInvoiceFilePath(invoice);
    if (!fs.existsSync(filePath)) continue;

    const text = await extractTextFromPdf(fs.readFileSync(filePath));
    const parsed = extractSupplierInvoiceTotal(text);
    if (!parsed) continue;

    updateJsonStore<{ invoices: SupplierInvoiceRecord[] }>(storePath, (store) => {
      const row = store.invoices.find((item) => item.id === invoice.id);
      if (!row || (row.amount && row.currency)) return false;
      row.amount = parsed.amount;
      row.currency = parsed.currency;
      return true;
    });
    updated += 1;
  }

  return updated;
}

export async function enrichTransporterInvoiceAmounts(): Promise<number> {
  let updated = 0;
  const storePath = `${process.cwd()}/transporter-invoices${STORE_PATH_SUFFIX}`;

  for (const invoice of listTransporterInvoices(500)) {
    if (invoice.amount && invoice.currency) continue;

    const filePath = getTransporterInvoiceFilePath(invoice);
    if (!filePath || !fs.existsSync(filePath)) continue;

    const text = await extractTextFromPdf(fs.readFileSync(filePath));
    const parsed = extractCustomsInvoiceTotal(text);
    if (!parsed) continue;

    updateJsonStore<{ invoices: TransporterInvoiceRecord[] }>(storePath, (store) => {
      const row = store.invoices.find((item) => item.id === invoice.id);
      if (!row || (row.amount && row.currency)) return false;
      row.amount = parsed.amount;
      row.currency = parsed.currency;
      return true;
    });
    updated += 1;
  }

  return updated;
}

export async function enrichAllInvoiceAmounts(): Promise<void> {
  await enrichSupplierInvoiceAmounts();
  await enrichTransporterInvoiceAmounts();
}

export function patchSupplierInvoiceAmount(
  id: string,
  amount: string,
  currency: string
): SupplierInvoiceRecord | null {
  const storePath = `${process.cwd()}/supplier-invoices${STORE_PATH_SUFFIX}`;
  let patched: SupplierInvoiceRecord | null = null;

  updateJsonStore<{ invoices: SupplierInvoiceRecord[] }>(storePath, (store) => {
    const row = store.invoices.find((item) => item.id === id);
    if (!row) return false;
    row.amount = amount;
    row.currency = currency;
    patched = row;
    return true;
  });

  return patched ?? getSupplierInvoice(id) ?? null;
}
