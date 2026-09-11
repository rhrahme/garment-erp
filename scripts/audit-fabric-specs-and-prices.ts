/**
 * Read-only audit: every fabric line on every sales order, checked against the
 * mill price list it claims to come from.
 *
 * Reports, never writes. Prices are reported as a disagreement to look at, not
 * corrected - what a client is charged is not this script's business.
 *
 * Run: node --experimental-strip-types --experimental-loader \
 *   ./scripts/tsconfig-paths-loader.mjs scripts/audit-fabric-specs-and-prices.ts
 */
import { readFileSync } from "node:fs";
import { resolveFabricItemFromCatalog } from "@/lib/fabric-sourcing/resolve-fabric-from-catalog";
import { normalizeInvoiceCompositionKey } from "@/lib/invoicing/consolidate-lines";

type Verdict =
  | "ok"
  | "spec_mismatch"
  | "price_mismatch"
  | "spec_and_price_mismatch"
  | "not_in_price_list"
  | "no_number";

type Finding = {
  so_number: string;
  client_code: string;
  client_name: string;
  garment: string;
  supplier_id: string;
  fabric_number: string;
  verdict: Verdict;
  stored_composition: string | null;
  catalog_composition: string | null;
  stored_weight: number | null;
  catalog_weight: number | null;
  stored_price: number | null;
  catalog_price: number | null;
};

const hasPct = (value: string | null): boolean => value != null && /\d\s*%/.test(value);

/**
 * Compare what the cloth is made of, not how it is written. The ERP's own
 * fibre key drops mill collection names, so "100% Linen" and
 * "STREET LINO ALOE NEW 100% LINEN" are the same cloth, while "100% Cotton"
 * against "100% WOOL" is a real error.
 */
function sameComposition(a: string | null, b: string | null): boolean {
  const fibre = (value: string | null) => normalizeInvoiceCompositionKey(value);
  const keyA = fibre(a);
  const keyB = fibre(b);
  if (keyA && keyB) return keyA === keyB;
  // Neither side parsed into fibres - fall back to plain text.
  const plain = (value: string | null) => (value ?? "").toLowerCase().replace(/[^a-z0-9%]+/g, "");
  return plain(a) === plain(b);
}

function audit(): Finding[] {
  const raw = JSON.parse(readFileSync("src/data/sales-orders.json", "utf8")) as {
    orders?: Array<Record<string, any>>;
  };
  const findings: Finding[] = [];

  for (const order of raw.orders ?? []) {
    for (const line of order.fabric_lines ?? []) {
      const supplierId: string = line.supplier_id ?? "";
      const fabricNumber: string = String(line.fabric_number ?? "").trim();
      const storedComposition: string | null = line.composition ?? null;
      const storedWeight: number | null = line.weight_gsm ?? null;
      const storedPrice: number | null =
        typeof line.unit_price === "number" && line.unit_price > 0 ? line.unit_price : null;

      const base = {
        so_number: order.so_number,
        client_code: order.client_code,
        client_name: order.client_name,
        garment: line.garment_type ?? "",
        supplier_id: supplierId,
        fabric_number: fabricNumber,
        stored_composition: storedComposition,
        stored_weight: storedWeight,
        stored_price: storedPrice,
      };

      if (!fabricNumber) {
        findings.push({
          ...base,
          verdict: "no_number",
          catalog_composition: null,
          catalog_weight: null,
          catalog_price: null,
        });
        continue;
      }

      const catalog = resolveFabricItemFromCatalog(supplierId, fabricNumber);
      if (catalog.manual) {
        findings.push({
          ...base,
          verdict: "not_in_price_list",
          catalog_composition: null,
          catalog_weight: null,
          catalog_price: null,
        });
        continue;
      }

      // The Drapers list names fibres without their shares; that is not a
      // disagreement with a stored composition that states them.
      const compVague = hasPct(storedComposition) && !hasPct(catalog.composition);
      const compDiffers =
        storedComposition != null &&
        catalog.composition != null &&
        !compVague &&
        !sameComposition(storedComposition, catalog.composition);
      const weightDiffers =
        storedWeight != null && catalog.weight_gsm != null && storedWeight !== catalog.weight_gsm;
      const priceDiffers =
        storedPrice != null &&
        catalog.unit_price != null &&
        Math.abs(storedPrice - catalog.unit_price) > 0.01;

      const specBad = compDiffers || weightDiffers;
      const verdict: Verdict = specBad
        ? priceDiffers
          ? "spec_and_price_mismatch"
          : "spec_mismatch"
        : priceDiffers
          ? "price_mismatch"
          : "ok";

      findings.push({
        ...base,
        verdict,
        catalog_composition: catalog.composition,
        catalog_weight: catalog.weight_gsm,
        catalog_price: catalog.unit_price,
      });
    }
  }

  return findings;
}

function describe(finding: Finding): string {
  const parts: string[] = [];
  if (
    finding.stored_composition != null &&
    finding.catalog_composition != null &&
    !sameComposition(finding.stored_composition, finding.catalog_composition)
  ) {
    parts.push(
      `composition "${finding.stored_composition}" vs list "${finding.catalog_composition}"`
    );
  }
  if (
    finding.stored_weight != null &&
    finding.catalog_weight != null &&
    finding.stored_weight !== finding.catalog_weight
  ) {
    parts.push(`weight ${finding.stored_weight} vs list ${finding.catalog_weight}`);
  }
  if (
    finding.stored_price != null &&
    finding.catalog_price != null &&
    Math.abs(finding.stored_price - finding.catalog_price) > 0.01
  ) {
    parts.push(`price ${finding.stored_price} vs list ${finding.catalog_price}`);
  }
  return parts.join("; ");
}

const findings = audit();
const rawArg = process.argv[2] ?? null;
const byClient = rawArg === "--by-client";
const target = byClient ? null : rawArg;
const scoped = target ? findings.filter((f) => f.client_code === target) : findings;

if (byClient) {
  const invoices = (
    JSON.parse(readFileSync("src/data/customer-invoices.json", "utf8")).invoices ?? []
  ) as Array<Record<string, any>>;
  const invoiceByClient = new Map<string, string[]>();
  for (const invoice of invoices) {
    const key = invoice.client_code ?? "";
    if (!invoiceByClient.has(key)) invoiceByClient.set(key, []);
    invoiceByClient
      .get(key)!
      .push(`${invoice.invoice_number} (${invoice.status}, ${(invoice.lines ?? []).length} lines)`);
  }

  const clients = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = `${finding.client_code}\u0000${finding.client_name}`;
    if (!clients.has(key)) clients.set(key, []);
    clients.get(key)!.push(finding);
  }

  const ordered = [...clients.entries()].sort((a, b) => {
    const bad = (rows: Finding[]) => rows.filter((r) => r.verdict.includes("mismatch")).length;
    return bad(b[1]) - bad(a[1]);
  });

  for (const [key, rows] of ordered) {
    const [code, name] = key.split("\u0000");
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;
    const sos = [...new Set(rows.map((r) => r.so_number))];
    const inv = invoiceByClient.get(code ?? "") ?? [];

    console.log(`\n${"=".repeat(78)}`);
    console.log(`${name}  [${code}]`);
    console.log(`  ${rows.length} fabric lines across ${sos.length} order(s): ${sos.join(", ")}`);
    console.log(`  invoice(s) here: ${inv.length > 0 ? inv.join(", ") : "none in this snapshot"}`);
    console.log(
      `  agrees with price list: ${counts.ok ?? 0} | in no price list: ${counts.not_in_price_list ?? 0} | spec wrong: ${(counts.spec_mismatch ?? 0) + (counts.spec_and_price_mismatch ?? 0)} | price differs: ${(counts.price_mismatch ?? 0) + (counts.spec_and_price_mismatch ?? 0)}`
    );

    const problems = rows.filter((r) => r.verdict.includes("mismatch"));
    for (const row of problems) {
      console.log(`    ${row.so_number} | ${row.garment} | ${row.supplier_id} ${row.fabric_number}`);
      console.log(`        ${describe(row)}`);
    }
    const unlisted = [
      ...new Set(rows.filter((r) => r.verdict === "not_in_price_list").map((r) => `${r.supplier_id} ${r.fabric_number}`)),
    ];
    if (unlisted.length > 0) {
      console.log(`    in no price list: ${unlisted.join(", ")}`);
    }
  }
  process.exit(0);
}

const counts: Record<string, number> = {};
for (const f of scoped) counts[f.verdict] = (counts[f.verdict] ?? 0) + 1;

console.log(`Lines audited: ${scoped.length}${target ? ` (client ${target})` : ""}`);
console.log(counts);
console.log("");

for (const verdict of [
  "spec_and_price_mismatch",
  "spec_mismatch",
  "price_mismatch",
  "not_in_price_list",
  "no_number",
] as Verdict[]) {
  const rows = scoped.filter((f) => f.verdict === verdict);
  if (rows.length === 0) continue;
  console.log(`--- ${verdict} (${rows.length}) ---`);
  if (verdict === "not_in_price_list" || verdict === "no_number") {
    const grouped = new Map<string, Set<string>>();
    for (const row of rows) {
      const key = row.supplier_id || "(no supplier)";
      if (!grouped.has(key)) grouped.set(key, new Set());
      grouped.get(key)!.add(row.fabric_number || "(blank)");
    }
    for (const [supplier, numbers] of grouped) {
      console.log(`  ${supplier}: ${numbers.size} numbers - ${[...numbers].sort().join(", ")}`);
    }
  } else {
    for (const row of rows) {
      console.log(
        `  ${row.so_number} ${row.client_name} | ${row.garment} | ${row.supplier_id} ${row.fabric_number}\n      ${describe(row)}`
      );
    }
  }
  console.log("");
}
