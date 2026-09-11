/**
 * Read-only audit of stored customer invoices: the arithmetic, the VAT, the due
 * date, the payments, and whether each sales order is billed exactly once.
 *
 * Checks against the ERP's own functions rather than a second implementation of
 * the same rules, so a disagreement means the stored row is stale, not that I
 * read the rule differently.
 *
 * Covers only invoices in the committed snapshot. Production truth is Supabase,
 * which needs a service role key this script does not have.
 *
 * Run: node --experimental-strip-types --experimental-loader \
 *   ./scripts/tsconfig-paths-loader.mjs scripts/audit-invoice-arithmetic.ts
 */
import { readFileSync } from "node:fs";

import { getInvoiceAmountPaid } from "@/lib/invoicing/payments";
import { computeDueDate } from "@/lib/invoicing/pricing";
import { resolveInvoiceVatRate } from "@/lib/invoicing/vat";

type Line = {
  id: string;
  description?: string;
  garment_type?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  article_number?: number | null;
  sticker_code?: string | null;
  sales_order_line_id?: string | null;
  so_number?: string | null;
};

type Invoice = {
  invoice_number: string;
  client_name: string;
  client_code: string;
  status: string;
  currency: string;
  invoice_date: string;
  due_date: string | null;
  payment_terms?: string | null;
  delivery_destination?: string | null;
  so_number?: string | null;
  sales_order_id?: string | null;
  sales_orders?: Array<{ id: string; so_number: string }>;
  lines: Line[];
  subtotal: number;
  vat_rate: number | null;
  vat_amount: number;
  total: number;
  payments?: Array<{ amount: number }>;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const money = (value: number) => value.toFixed(2);

const invoices: Invoice[] = JSON.parse(
  readFileSync("src/data/customer-invoices.json", "utf8")
).invoices ?? [];
const orders: Array<Record<string, any>> = JSON.parse(
  readFileSync("src/data/sales-orders.json", "utf8")
).orders ?? [];

const problems: string[] = [];
const note = (invoice: Invoice, text: string) =>
  problems.push(`${invoice.invoice_number} | ${invoice.client_name} [${invoice.client_code}] | ${text}`);

for (const invoice of invoices) {
  // --- line arithmetic ---
  for (const line of invoice.lines ?? []) {
    const expected = round2(line.quantity * line.unit_price);
    if (round2(line.line_total) !== expected) {
      note(
        invoice,
        `line "${line.description ?? line.garment_type}": ${line.quantity} x ${money(line.unit_price)} = ${money(expected)}, stored ${money(line.line_total)}`
      );
    }
  }

  // --- document arithmetic ---
  const subtotal = round2((invoice.lines ?? []).reduce((sum, line) => sum + line.line_total, 0));
  if (round2(invoice.subtotal) !== subtotal) {
    note(invoice, `subtotal: lines add to ${money(subtotal)}, stored ${money(invoice.subtotal)}`);
  }

  const rate = invoice.vat_rate != null && invoice.vat_rate > 0 ? invoice.vat_rate : 0;
  const vat = rate > 0 ? round2(invoice.subtotal * rate) : 0;
  if (round2(invoice.vat_amount) !== vat) {
    note(
      invoice,
      `VAT: ${money(invoice.subtotal)} at ${(rate * 100).toFixed(0)}% = ${money(vat)}, stored ${money(invoice.vat_amount)}`
    );
  }

  const total = round2(invoice.subtotal + invoice.vat_amount);
  if (round2(invoice.total) !== total) {
    note(invoice, `total: ${money(invoice.subtotal)} + ${money(invoice.vat_amount)} = ${money(total)}, stored ${money(invoice.total)}`);
  }

  // --- VAT rate against the delivery destination ---
  //
  // resolveInvoiceVatRate returns null, not 0, outside Saudi, and invoices
  // store that same null. Both mean "no VAT", so normalise before comparing.
  if (invoice.delivery_destination) {
    const expectedRate = resolveInvoiceVatRate(invoice.delivery_destination as never) ?? 0;
    const storedRate = invoice.vat_rate ?? 0;
    if (storedRate !== expectedRate) {
      note(
        invoice,
        `VAT rate ${(storedRate * 100).toFixed(0)}% stored, but ${invoice.delivery_destination} calls for ${(expectedRate * 100).toFixed(0)}%`
      );
    }
  }

  // --- due date against the payment terms ---
  const expectedDue = computeDueDate(invoice.invoice_date, invoice.payment_terms ?? null);
  if ((invoice.due_date ?? null) !== (expectedDue ?? null)) {
    note(
      invoice,
      `due date ${invoice.due_date ?? "none"} stored, terms "${invoice.payment_terms ?? "none"}" on ${invoice.invoice_date} give ${expectedDue ?? "none"}`
    );
  }

  // --- payments ---
  //
  // An invoice marked paid with an empty ledger is a supported state, not a
  // gap: getInvoiceAmountPaid treats those legacy rows as fully paid. Only a
  // ledger that overshoots the total is a real contradiction.
  const ledger = round2((invoice.payments ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0));
  if (ledger > round2(invoice.total) + 0.001) {
    note(invoice, `payments ledger totals ${money(ledger)}, above the invoice total ${money(invoice.total)}`);
  }
  if (invoice.status !== "paid" && ledger > 0 && ledger >= round2(invoice.total)) {
    note(invoice, `payments cover the full ${money(invoice.total)} but the invoice is still ${invoice.status}`);
  }

  // --- article numbering ---
  const articles = (invoice.lines ?? [])
    .map((line) => line.article_number)
    .filter((value): value is number => value != null);
  const duplicated = articles.filter((value, index) => articles.indexOf(value) !== index);
  if (duplicated.length > 0) {
    note(invoice, `article number(s) used twice: ${[...new Set(duplicated)].join(", ")}`);
  }

  // --- negative or zero quantities ---
  for (const line of invoice.lines ?? []) {
    if (!(line.quantity > 0)) {
      note(invoice, `line "${line.description ?? line.garment_type}" has quantity ${line.quantity}`);
    }
    if (line.unit_price < 0) {
      note(invoice, `line "${line.description ?? line.garment_type}" has a negative price`);
    }
  }

  // An invoice that carries articles but adds to nothing is safe as a draft and
  // wrong the moment it is sent, so it is worth naming while it is still a draft.
  if ((invoice.lines ?? []).length > 0 && round2(invoice.total) === 0) {
    note(invoice, `${invoice.lines.length} article(s) but a total of zero - every line is unpriced`);
  }
}

// --- duplicate invoice numbers -------------------------------------------
const numberCounts = new Map<string, number>();
for (const invoice of invoices) {
  numberCounts.set(invoice.invoice_number, (numberCounts.get(invoice.invoice_number) ?? 0) + 1);
}
const duplicateNumbers = [...numberCounts.entries()].filter(([, count]) => count > 1);

// --- an order billed on two invoices, or on none --------------------------
const invoicedOrders = new Map<string, string[]>();
for (const invoice of invoices) {
  const sos = new Set<string>();
  if (invoice.so_number) sos.add(invoice.so_number);
  for (const entry of invoice.sales_orders ?? []) sos.add(entry.so_number);
  for (const line of invoice.lines ?? []) if (line.so_number) sos.add(line.so_number);
  for (const so of sos) {
    if (!invoicedOrders.has(so)) invoicedOrders.set(so, []);
    invoicedOrders.get(so)!.push(invoice.invoice_number);
  }
}
const billedTwice = [...invoicedOrders.entries()].filter(([, list]) => new Set(list).size > 1);

// --- report ---------------------------------------------------------------
console.log(`Invoices examined: ${invoices.length} (committed snapshot only)`);
console.log(`Invoice lines examined: ${invoices.reduce((sum, i) => sum + (i.lines ?? []).length, 0)}`);
console.log(`Arithmetic / rule disagreements: ${problems.length}\n`);
for (const problem of problems) console.log(`  ${problem}`);
if (problems.length === 0) console.log("  none");

console.log(`\nDuplicate invoice numbers: ${duplicateNumbers.length}`);
for (const [number, count] of duplicateNumbers) console.log(`  ${number} appears ${count} times`);

console.log(`\nSales orders appearing on more than one invoice: ${billedTwice.length}`);
for (const [so, list] of billedTwice) console.log(`  ${so} -> ${[...new Set(list)].join(", ")}`);

const openOrders = orders.filter((order) => !invoicedOrders.has(order.so_number));
console.log(`\nOrders with no invoice in the snapshot: ${openOrders.length} of ${orders.length}`);
const byClient = new Map<string, number>();
for (const order of openOrders) {
  const key = `${order.client_name} [${order.client_code}]`;
  byClient.set(key, (byClient.get(key) ?? 0) + 1);
}
for (const [client, count] of [...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${client}: ${count} order(s)`);
}

const allLines = invoices.flatMap((invoice) => invoice.lines ?? []);
const unpriced = allLines.filter((line) => !(line.unit_price > 0));
console.log(
  `\nUnpriced invoice lines: ${unpriced.length} of ${allLines.length} - the owner prices these himself`
);

console.log(`\nPer invoice:`);
for (const invoice of invoices) {
  const paid = getInvoiceAmountPaid(invoice as never);
  console.log(
    `  ${invoice.invoice_number} | ${invoice.status.padEnd(5)} | ${String((invoice.lines ?? []).length).padStart(3)} lines | sub ${money(invoice.subtotal).padStart(10)} | VAT ${money(invoice.vat_amount).padStart(9)} | total ${money(invoice.total).padStart(10)} | paid ${money(paid).padStart(10)} | ${invoice.client_name}`
  );
}
