/**
 * Read-only audit of work that has no invoice behind it.
 *
 * Every invoice audit in this repo starts from the invoice list, so a client
 * who was never invoiced at all is invisible to all of them - the order can be
 * cut, sewn and finished without anything ever reporting on it. This starts
 * from the sales orders instead.
 *
 * An open order having no invoice is normal: it is still in production. A
 * finished one is not, and is reported first.
 *
 * Run: node --experimental-strip-types --experimental-loader \
 *   ./scripts/tsconfig-paths-loader.mjs scripts/audit-uninvoiced-orders.ts
 */
import { getSalesOrderCost } from "@/lib/costing/compute";
import { readCustomerInvoices } from "@/lib/data/customer-invoices";
import { readSalesOrders } from "@/lib/data/sales-orders";
import { resolveFabricItemFromCatalog } from "@/lib/fabric-sourcing/resolve-fabric-from-catalog";
import type { SalesOrder } from "@/lib/types/sales-orders";

const orders = readSalesOrders().orders;
const invoices = readCustomerInvoices().invoices;

const invoicedOrderIds = new Set<string>();
for (const invoice of invoices) {
  if (invoice.sales_order_id) invoicedOrderIds.add(invoice.sales_order_id);
  for (const id of invoice.sales_order_ids ?? []) invoicedOrderIds.add(id);
}

const live = orders.filter((order) => order.status !== "superseded" && order.status !== "cancelled");
const uninvoiced = live.filter((order) => !invoicedOrderIds.has(order.id));

const lineCount = (order: SalesOrder): number => (order.fabric_lines ?? []).length;

console.log(`${orders.length} sales orders. ${invoicedOrderIds.size} have an invoice.`);
console.log(`${uninvoiced.length} live orders have none, carrying ${uninvoiced.reduce((sum, o) => sum + lineCount(o), 0)} fabric lines.\n`);

const finished = uninvoiced.filter((order) => order.status === "complete");
console.log(`=== finished but never invoiced (${finished.length}) ===`);
if (finished.length === 0) console.log("  none");
for (const order of finished) {
  const cost = getSalesOrderCost(order);
  console.log(
    `  ${order.so_number}  ${order.client_name} (${order.client_code})  ${lineCount(order)} lines  fabric cost SAR ${cost.fabric_cost_sar}`
  );
}

console.log("\n=== still in production, no invoice yet (by client) ===");
const byClient = new Map<string, { orders: number; lines: number }>();
for (const order of uninvoiced) {
  if (order.status === "complete") continue;
  const key = `${order.client_name} (${order.client_code})`;
  const entry = byClient.get(key) ?? { orders: 0, lines: 0 };
  entry.orders += 1;
  entry.lines += lineCount(order);
  byClient.set(key, entry);
}
for (const [client, entry] of [...byClient].sort((a, b) => b[1].lines - a[1].lines)) {
  console.log(`  ${String(entry.orders).padStart(2)} order(s)  ${String(entry.lines).padStart(3)} lines  ${client}`);
}

// A number the price lists cannot answer will print blank on the invoice and
// carry no cost. Catching it now is cheaper than catching it on an invoice.
//
// The resolver never returns nothing: a number it does not know comes back as a
// `manual` stub with every spec null, which is what makes the invoice cell
// blank rather than wrong. That flag is the thing to count, not nullishness.
console.log("\n=== fabric numbers on uninvoiced orders that no price list answers ===");
const unresolved = new Map<string, { orders: Set<string>; lines: number }>();
for (const order of uninvoiced) {
  for (const line of order.fabric_lines ?? []) {
    if (!line.fabric_number) continue;
    if (resolveFabricItemFromCatalog(line.supplier_id, line.fabric_number)?.manual === false) continue;
    const key = `${line.supplier_id}  ${line.fabric_number}`;
    const entry = unresolved.get(key) ?? { orders: new Set<string>(), lines: 0 };
    entry.orders.add(order.so_number);
    entry.lines += 1;
    unresolved.set(key, entry);
  }
}
console.log(`${unresolved.size} distinct numbers across ${uninvoiced.length} orders.\n`);
for (const [key, entry] of [...unresolved].sort((a, b) => b[1].lines - a[1].lines).slice(0, 40)) {
  console.log(`  ${String(entry.lines).padStart(3)} lines  ${key}   (${[...entry.orders].slice(0, 3).join(", ")})`);
}
