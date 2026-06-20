import path from "path";
import {
  readJsonFile,
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import { recalculateInvoiceTotals } from "@/lib/invoicing/build-invoice";
import type {
  CustomerInvoice,
  CustomerInvoiceSummary,
  CustomerInvoicesFile,
} from "@/lib/types/customer-invoices";

const INVOICES_PATH = path.join(process.cwd(), "src/data/customer-invoices.json");

const EMPTY: CustomerInvoicesFile = {
  updated_at: null,
  invoices: [],
};

export function readCustomerInvoices(): CustomerInvoicesFile {
  return readJsonFile(INVOICES_PATH, EMPTY);
}

export async function readCustomerInvoicesAsync(): Promise<CustomerInvoicesFile> {
  return readJsonFileAsync(INVOICES_PATH, EMPTY);
}

/** Bypass in-process cache — use on invoice detail after mutations (multi-instance safe). */
export async function readCustomerInvoicesFresh(): Promise<CustomerInvoicesFile> {
  return readJsonFileFreshAsync(INVOICES_PATH, EMPTY, { force: true });
}

export async function writeCustomerInvoices(data: CustomerInvoicesFile): Promise<CustomerInvoicesFile> {
  const payload: CustomerInvoicesFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(INVOICES_PATH, payload);
}

export function getCustomerInvoiceById(id: string): CustomerInvoice | undefined {
  return readCustomerInvoices().invoices.find((invoice) => invoice.id === id);
}

/** Bypass in-process cache — use on invoice detail after create/update (multi-instance safe). */
export async function getCustomerInvoiceByIdFresh(id: string): Promise<CustomerInvoice | undefined> {
  const store = await readCustomerInvoicesFresh();
  return store.invoices.find((invoice) => invoice.id === id);
}

export function getCustomerInvoiceBySalesOrderId(salesOrderId: string): CustomerInvoice | undefined {
  return readCustomerInvoices().invoices.find((invoice) => invoice.sales_order_id === salesOrderId);
}

/** Bypass in-process cache — use on order detail when invoice may exist in Supabase but not local cache. */
export async function getCustomerInvoiceBySalesOrderIdFresh(
  salesOrderId: string
): Promise<CustomerInvoice | undefined> {
  const store = await readCustomerInvoicesFresh();
  return store.invoices.find((invoice) => invoice.sales_order_id === salesOrderId);
}

export function generateInvoiceNumber(invoices: CustomerInvoice[]): string {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  let max = 0;
  for (const invoice of invoices) {
    if (!invoice.invoice_number.startsWith(prefix)) continue;
    const seq = Number.parseInt(invoice.invoice_number.slice(prefix.length), 10);
    if (!Number.isNaN(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function generateInvoiceId(): string {
  return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveCustomerInvoice(invoice: CustomerInvoice): Promise<CustomerInvoice> {
  const store = await readCustomerInvoicesFresh();
  const index = store.invoices.findIndex((row) => row.id === invoice.id);
  const { lines, subtotal, total } = recalculateInvoiceTotals(invoice.lines);
  const normalized: CustomerInvoice = { ...invoice, lines, subtotal, total };

  if (index >= 0) {
    store.invoices[index] = normalized;
  } else {
    store.invoices.push(normalized);
  }

  await writeCustomerInvoices(store);
  return normalized;
}

export function getCustomerInvoiceSummary(
  file: CustomerInvoicesFile = readCustomerInvoices()
): CustomerInvoiceSummary {
  const draft = file.invoices.filter((invoice) => invoice.status === "draft");
  const sent = file.invoices.filter((invoice) => invoice.status === "sent");
  const paid = file.invoices.filter((invoice) => invoice.status === "paid");

  return {
    invoice_count: file.invoices.length,
    draft_count: draft.length,
    sent_count: sent.length,
    paid_count: paid.length,
    outstanding_sar: roundMoney([...draft, ...sent].reduce((sum, invoice) => sum + invoice.total, 0)),
    paid_sar: roundMoney(paid.reduce((sum, invoice) => sum + invoice.total, 0)),
  };
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function listCustomerInvoicesSorted(): CustomerInvoice[] {
  return [...readCustomerInvoices().invoices].sort((a, b) => {
    const dateCompare = b.invoice_date.localeCompare(a.invoice_date);
    if (dateCompare !== 0) return dateCompare;
    return b.invoice_number.localeCompare(a.invoice_number);
  });
}
