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
const target = process.argv[2] ?? null;
const scoped = target ? findings.filter((f) => f.client_code === target) : findings;

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
