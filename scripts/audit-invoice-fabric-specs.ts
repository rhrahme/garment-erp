/**
 * Read-only audit: every line of every customer invoice, rendered exactly the
 * way the client's PDF renders it, then checked against the mill price list.
 *
 * The order-level audit (audit-fabric-specs-and-prices.ts) reports what is
 * *stored*. This one reports what is *printed*, which is not the same thing:
 * invoice lines are re-resolved against the price list every time they are
 * read, so a wrong stored composition is overridden before a client sees it.
 * That claim is worth testing rather than trusting, which is what this does.
 *
 * A line is only "verified" when the price list supplied the spec. Anything
 * else prints blank, and blank is counted and listed here, because a blank
 * cell on a client invoice is a question for the owner, not a pass.
 *
 * Reports, never writes. Unit prices on an invoice line are the garment price
 * the owner set, not a mill price, so they are not checked against anything.
 *
 * Run: node --experimental-strip-types --experimental-loader \
 *   ./scripts/tsconfig-paths-loader.mjs scripts/audit-invoice-fabric-specs.ts
 */
import { readFileSync } from "node:fs";
import { enrichInvoiceLinesWithFabricDetails } from "@/lib/invoicing/build-invoice";
import { resolveFabricItemFromCatalog } from "@/lib/fabric-sourcing/resolve-fabric-from-catalog";
import { findFabricCatalogOwner } from "@/lib/fabric-sourcing/fabric-catalog-owner";
import type { CustomerInvoice, CustomerInvoiceLine } from "@/lib/types/invoicing";
import type { SalesOrder } from "@/lib/types/sales-orders";

type Verdict =
  | "verified_from_list"
  | "blank_not_in_list"
  | "blank_no_number"
  | "printed_unverified";

type Row = {
  invoice_number: string;
  client_name: string;
  article: number | null;
  garment: string;
  fabric_number: string;
  supplier_id: string;
  printed_composition: string | null;
  printed_weight: number | null;
  verdict: Verdict;
};

const orders = (
  JSON.parse(readFileSync("src/data/sales-orders.json", "utf8")).orders ?? []
) as SalesOrder[];
const invoices = (
  JSON.parse(readFileSync("src/data/customer-invoices.json", "utf8")).invoices ?? []
) as CustomerInvoice[];

const orderById = new Map(orders.map((order) => [order.id, order]));
const orderByNumber = new Map(orders.map((order) => [order.so_number, order]));

/** The mill a printed line was actually looked up in, for reporting. */
function supplierForLine(order: SalesOrder | undefined, line: CustomerInvoiceLine): string {
  const match = (order?.fabric_lines ?? []).find(
    (fabricLine) =>
      fabricLine.id === line.sales_order_line_id ||
      (line.fabric_number != null && fabricLine.fabric_number === line.fabric_number)
  );
  return match?.supplier_id ?? "";
}

const rows: Row[] = [];
const missingOrders: string[] = [];

for (const invoice of invoices) {
  const order =
    orderById.get(invoice.sales_order_id ?? "") ?? orderByNumber.get(invoice.so_number ?? "");
  if (!order) {
    missingOrders.push(`${invoice.invoice_number} -> ${invoice.so_number}`);
  }

  const printed = enrichInvoiceLinesWithFabricDetails(invoice.lines ?? [], order);

  for (const line of printed) {
    const fabricNumber = String(line.fabric_number ?? "").trim();
    const supplierId = supplierForLine(order, line);
    const hasComposition = Boolean(line.composition);
    const hasWeight = line.weight_gsm != null;

    let verdict: Verdict;
    if (!fabricNumber) {
      verdict = "blank_no_number";
    } else {
      const catalog = resolveFabricItemFromCatalog(supplierId, fabricNumber);
      if (catalog.manual) {
        // Not in any price list. The renderer is supposed to blank both cells;
        // if anything still prints, it came from somewhere untraceable.
        verdict = hasComposition || hasWeight ? "printed_unverified" : "blank_not_in_list";
      } else {
        verdict = hasComposition || hasWeight ? "verified_from_list" : "blank_not_in_list";
      }
    }

    rows.push({
      invoice_number: invoice.invoice_number,
      client_name: invoice.client_name ?? invoice.client_code ?? "",
      article: line.article_number ?? null,
      garment: line.garment_type ?? "",
      fabric_number: fabricNumber,
      supplier_id: supplierId,
      printed_composition: line.composition ?? null,
      printed_weight: line.weight_gsm ?? null,
      verdict,
    });
  }
}

const tally = rows.reduce<Record<string, number>>((acc, row) => {
  acc[row.verdict] = (acc[row.verdict] ?? 0) + 1;
  return acc;
}, {});

console.log(`Invoices audited: ${invoices.length}`);
console.log(`Invoice lines audited: ${rows.length}`);
console.log(tally);

if (missingOrders.length > 0) {
  console.log(`\n--- invoice has no sales order in this snapshot (${missingOrders.length}) ---`);
  for (const entry of missingOrders) console.log(`  ${entry}`);
}

const unverified = rows.filter((row) => row.verdict === "printed_unverified");
console.log(`\n--- printed a spec no price list backs (${unverified.length}) ---`);
for (const row of unverified) {
  console.log(
    `  ${row.invoice_number} ${row.client_name} | art ${row.article} ${row.garment} | ` +
      `${row.supplier_id} ${row.fabric_number} | "${row.printed_composition}" ${row.printed_weight}`
  );
}

console.log("\n--- per invoice ---");
for (const invoice of invoices) {
  const mine = rows.filter((row) => row.invoice_number === invoice.invoice_number);
  const verified = mine.filter((row) => row.verdict === "verified_from_list").length;
  const blank = mine.length - verified;
  console.log(
    `  ${invoice.invoice_number} ${String(invoice.client_name ?? "").padEnd(36)} ` +
      `${String(mine.length).padStart(3)} lines | ${String(verified).padStart(3)} from list | ` +
      `${String(blank).padStart(3)} blank`
  );
}

const blanks = rows.filter(
  (row) => row.verdict === "blank_not_in_list" || row.verdict === "blank_no_number"
);

/**
 * A blank cell has two very different causes, and they need different people.
 *
 * If another mill's uploaded list already holds the number, the cloth is not
 * missing at all - the line is just filed under the wrong supplier, and the
 * specs appear the moment that is corrected. If no list holds it, the price
 * list itself has not been uploaded, and no amount of editing will fill the
 * cell. Splitting them turns "10 blanks" into two short worklists.
 */
const misfiled: string[] = [];
const absent: string[] = [];

const byNumber = new Map<string, { count: number; invoices: Set<string>; supplier: string }>();
for (const row of blanks) {
  const key = `${row.supplier_id || "unknown"}  ${row.fabric_number || "(no number)"}`;
  if (!byNumber.has(key)) {
    byNumber.set(key, { count: 0, invoices: new Set(), supplier: row.supplier_id });
  }
  const entry = byNumber.get(key)!;
  entry.count += 1;
  entry.invoices.add(row.invoice_number);
}

for (const [key, entry] of byNumber) {
  const number = key.split(/\s{2,}/)[1] ?? "";
  const owner = number && number !== "(no number)" ? findFabricCatalogOwner(number) : null;
  const where = [...entry.invoices].join(" ");
  if (owner && owner.supplier_id !== entry.supplier) {
    misfiled.push(
      `  ${key.padEnd(40)} ${where}\n` +
        `      filed under "${entry.supplier}", but ${owner.supplier_name} lists this number`
    );
  } else {
    absent.push(`  ${key.padEnd(40)} ${where}`);
  }
}

console.log(`\n--- blank, but another mill's list has the number (${misfiled.length}) ---`);
for (const entry of misfiled) console.log(entry);

console.log(`\n--- blank, and no uploaded list has the number (${absent.length}) ---`);
for (const entry of absent) console.log(entry);
