/**
 * Read-only check that every cost hint worksheet actually carries the two
 * columns the owner works from: SAR/m and Meters/pc.
 *
 * The columns exist in the table, so a missing value is not a layout bug - it
 * means the row reached the sheet without a resolved mill price or without a
 * length. This reports which rows those are and why, per invoice and for the
 * sitewide sheet, so the gap can be read off rather than guessed at.
 *
 * Run: node --experimental-strip-types --experimental-loader \
 *   ./scripts/tsconfig-paths-loader.mjs scripts/audit-cost-hint-basis.ts
 */
import { loadCostHintWorksheet } from "@/lib/costing/load-cost-hint-worksheet";
import { readCustomerInvoices } from "@/lib/data/customer-invoices";
import { isWarehouseStockSupplier } from "@/lib/fabric-sourcing/supplier-aliases";

const invoices = readCustomerInvoices().invoices;

type Tally = { rows: number; withPrice: number; withMeters: number; withBoth: number };

const tally = (rows: { price_per_meter_sar: number | null; meters_per_piece: number | null }[]): Tally => ({
  rows: rows.length,
  withPrice: rows.filter((row) => row.price_per_meter_sar != null).length,
  withMeters: rows.filter((row) => row.meters_per_piece != null).length,
  withBoth: rows.filter((row) => row.price_per_meter_sar != null && row.meters_per_piece != null).length,
});

console.log("=== per invoice cost hint worksheet ===");
console.log("invoice        client                              rows  SAR/m  m/pc  both");

const totals: Tally = { rows: 0, withPrice: 0, withMeters: 0, withBoth: 0 };

for (const invoice of invoices) {
  const sheet = loadCostHintWorksheet({ invoiceId: invoice.id });
  if (!sheet) {
    console.log(`${invoice.invoice_number}  NO WORKSHEET`);
    continue;
  }
  const t = tally(sheet.rows);
  totals.rows += t.rows;
  totals.withPrice += t.withPrice;
  totals.withMeters += t.withMeters;
  totals.withBoth += t.withBoth;
  const flag = t.withBoth === t.rows ? "" : "   <-- incomplete";
  console.log(
    `${invoice.invoice_number}  ${invoice.client_name.slice(0, 34).padEnd(34)}  ${String(t.rows).padStart(4)}  ${String(
      t.withPrice
    ).padStart(5)}  ${String(t.withMeters).padStart(4)}  ${String(t.withBoth).padStart(4)}${flag}`
  );
}

console.log(
  `\ntotal: ${totals.rows} rows | ${totals.withPrice} have SAR/m | ${totals.withMeters} have meters/pc | ${totals.withBoth} have both`
);

const sitewide = loadCostHintWorksheet({ includeArchived: true });
if (sitewide) {
  const t = tally(sitewide.rows);
  console.log(
    `\n=== sitewide sheet ===\n${t.rows} rows | ${t.withPrice} have SAR/m | ${t.withMeters} have meters/pc | ${t.withBoth} have both`
  );
}

// The sheet's subtitle states an identity the owner prices from. A row that
// shows a price and a length which do not reach its own fabric cost is worse
// than a blank one, so every priced row is reconciled here.
//
// Duty is only charged on cloth that crosses the border. Canclini and Wool
// Stock sit in the warehouse with duty long since paid, so those rows are
// reconciled without it.
console.log("\n=== identity: SAR/m x meters x duty = fabric cost ===");
let checked = 0;
let off = 0;
for (const invoice of invoices) {
  const sheet = loadCostHintWorksheet({ invoiceId: invoice.id });
  if (!sheet) continue;
  for (const row of sheet.rows) {
    if (row.price_per_meter_sar == null || row.meters_per_piece == null || row.fabric_cost_sar == null) continue;
    checked += 1;
    const duty = isWarehouseStockSupplier(row.supplier_id ?? "") ? 1 : 1.05;
    const expected = row.price_per_meter_sar * row.meters_per_piece * duty;
    const diff = Math.abs(expected - row.fabric_cost_sar);
    if (diff > 0.01) {
      off += 1;
      console.log(
        `  ${invoice.invoice_number} art ${row.article_label} ${row.fabric_number}: ` +
          `${row.price_per_meter_sar} x ${row.meters_per_piece} x ${duty} = ${expected.toFixed(2)} but fabric cost is ${row.fabric_cost_sar}`
      );
    }
  }
}
console.log(`  ${checked} priced rows reconciled, ${off} off by more than a halala`);

console.log("\n=== rows missing SAR/m, by invoice ===");
for (const invoice of invoices) {
  const sheet = loadCostHintWorksheet({ invoiceId: invoice.id });
  if (!sheet) continue;
  const missing = sheet.rows.filter((row) => row.price_per_meter_sar == null);
  if (missing.length === 0) continue;
  console.log(`\n${invoice.invoice_number} ${invoice.client_name} (${missing.length}/${sheet.rows.length})`);
  for (const row of missing) {
    console.log(
      `  art ${String(row.article_label).padEnd(5)} ${row.garment.slice(0, 20).padEnd(20)} ${String(
        row.fabric_number
      ).padEnd(14)} ${String(row.fabric_brand ?? "-").padEnd(14)} meters/pc=${row.meters_per_piece ?? "-"}`
    );
  }
}
