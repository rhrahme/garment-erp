/**
 * Read-only audit of fabric line data quality, beyond fibre content and price.
 *
 * Each check reports only what our own data contradicts. Where a value merely
 * looks unusual to me, it is summarised rather than raised as an error: a rule
 * about how much cloth a garment takes is the owner's to set, not mine to guess.
 *
 * Run: node --experimental-strip-types --experimental-loader \
 *   ./scripts/tsconfig-paths-loader.mjs scripts/audit-order-line-anomalies.ts
 */
import { readFileSync } from "node:fs";

type Line = {
  so_number: string;
  order_date: string;
  client_code: string;
  client_name: string;
  garment: string;
  supplier_id: string;
  fabric_number: string;
  composition: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  sticker_codes: string[];
  line_id: string;
};

type Issue = { kind: string; line: Line; detail: string };

function readLines(): Line[] {
  const raw = JSON.parse(readFileSync("src/data/sales-orders.json", "utf8")) as {
    orders?: Array<Record<string, any>>;
  };
  const lines: Line[] = [];
  for (const order of raw.orders ?? []) {
    for (const line of order.fabric_lines ?? []) {
      lines.push({
        so_number: order.so_number,
        order_date: order.order_date ?? "",
        client_code: order.client_code ?? "",
        client_name: order.client_name ?? "",
        garment: line.garment_type ?? "",
        supplier_id: line.supplier_id ?? "",
        fabric_number: String(line.fabric_number ?? "").trim(),
        composition: line.composition ?? null,
        quantity: Number(line.quantity ?? 0),
        unit: line.unit ?? "",
        unit_price: Number(line.unit_price ?? 0),
        sticker_codes: (line.label_stickers ?? []).map((s: any) => String(s.code ?? "").trim()),
        line_id: String(line.id ?? ""),
      });
    }
  }
  return lines;
}

/** Ready-made brand accounts buy finished garments, so "Stock" is the true answer there. */
function isReadyMade(clientCode: string): boolean {
  return clientCode.startsWith("RM-");
}

function looksLikePlaceholderNumber(fabricNumber: string): boolean {
  const value = fabricNumber.toLowerCase();
  if (!value) return true;
  return (
    /^stock/.test(value) ||
    /^tbd$/.test(value) ||
    value.includes("client own") ||
    value.includes("own fabric") ||
    value === "fabric" ||
    value === "n/a" ||
    value === "-"
  );
}

function looksLikePlaceholderComposition(composition: string | null): boolean {
  const value = composition?.trim().toLowerCase() ?? "";
  return value === "composition" || value === "n/a" || value === "-" || value === "fabric" || value === "tbd";
}

/**
 * True when two numbers differ by a single *letter*.
 *
 * A one-character gap between mill codes is normal - "GEC 720" and "GEC 620"
 * are two real cloths. A one-letter gap inside a word is how a typo looks, and
 * that is the only case worth a person's time.
 */
function differsByOneLetter(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];

  let i = 0;
  let j = 0;
  let changed: string | null = null;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (changed != null) return false;
    changed = long[j]!;
    if (short.length === long.length) i += 1;
    j += 1;
  }
  if (changed == null && j < long.length) changed = long[j]!;
  return changed != null && /[a-z]/i.test(changed);
}

const lines = readLines();
const issues: Issue[] = [];

// --- Sticker codes that two different cloths share ------------------------
//
// The sticker code is what the floor scans. When two lines carry the same one,
// a scan cannot say which cloth is in hand.
const stickerOwners = new Map<string, Line[]>();
for (const line of lines) {
  for (const code of line.sticker_codes) {
    if (!code) continue;
    if (!stickerOwners.has(code)) stickerOwners.set(code, []);
    stickerOwners.get(code)!.push(line);
  }
}
const collidingStickers: Array<{ code: string; owners: Line[] }> = [];
for (const [code, owners] of stickerOwners) {
  const distinctLines = new Map(owners.map((line) => [line.line_id, line]));
  if (distinctLines.size > 1) {
    collidingStickers.push({ code, owners: [...distinctLines.values()] });
  }
}

// --- Quantity ------------------------------------------------------------
for (const line of lines) {
  if (line.quantity <= 0) {
    issues.push({ kind: "zero_quantity", line, detail: `${line.garment} with no metres recorded` });
  }
}

// A priced line at exactly one metre multiplies a real price by a placeholder,
// so unlike the unpriced ones it puts a wrong number on the cost worksheet.
for (const line of lines) {
  if (line.quantity === 1 && line.unit_price > 0) {
    issues.push({
      kind: "priced_line_at_one_metre",
      line,
      detail: `${line.unit_price}/m charged against 1 m of cloth for a ${line.garment}`,
    });
  }
}

// --- Placeholders where real values belong -------------------------------
for (const line of lines) {
  if (looksLikePlaceholderNumber(line.fabric_number) && !isReadyMade(line.client_code)) {
    issues.push({
      kind: "placeholder_fabric_number",
      line,
      detail: `fabric number reads "${line.fabric_number}"`,
    });
  }
  if (looksLikePlaceholderComposition(line.composition)) {
    issues.push({
      kind: "placeholder_composition",
      line,
      detail: `composition reads "${line.composition}"`,
    });
  }
}

// --- Fabric numbers one letter apart within the same mill ----------------
const numbersBySupplier = new Map<string, Set<string>>();
for (const line of lines) {
  if (!line.fabric_number) continue;
  if (!numbersBySupplier.has(line.supplier_id)) numbersBySupplier.set(line.supplier_id, new Set());
  numbersBySupplier.get(line.supplier_id)!.add(line.fabric_number);
}
const likelyTypos: string[] = [];
for (const [supplier, numbers] of numbersBySupplier) {
  const list = [...numbers];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i]!;
      const b = list[j]!;
      if (differsByOneLetter(a.toLowerCase(), b.toLowerCase())) {
        likelyTypos.push(`${supplier}: "${a}" and "${b}"`);
      }
    }
  }
}

// --- Report --------------------------------------------------------------
const counts = new Map<string, number>();
for (const issue of issues) counts.set(issue.kind, (counts.get(issue.kind) ?? 0) + 1);

console.log(`Fabric lines examined: ${lines.length}`);
console.log(`Orders examined: ${new Set(lines.map((line) => line.so_number)).size}`);
console.log(`Issues found: ${issues.length}\n`);
for (const [kind, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kind}: ${count}`);
}
console.log(`  sticker_code_reused: ${collidingStickers.length}`);
console.log(`  fabric_number_likely_typo: ${likelyTypos.length}`);

if (collidingStickers.length > 0) {
  console.log(`\n--- sticker_code_reused (${collidingStickers.length}) ---`);
  console.log("  One scannable code, two different cloths.\n");
  for (const { code, owners } of collidingStickers) {
    console.log(`  ${code}`);
    for (const owner of owners) {
      console.log(
        `    ${owner.so_number} | ${owner.client_name} [${owner.client_code}] | ${owner.garment} | ${owner.supplier_id} ${owner.fabric_number} | ${owner.quantity} m`
      );
    }
  }
}

for (const kind of counts.keys()) {
  const rows = issues.filter((issue) => issue.kind === kind);
  console.log(`\n--- ${kind} (${rows.length}) ---`);
  const byClient = new Map<string, Issue[]>();
  for (const row of rows) {
    const key = `${row.line.client_name} [${row.line.client_code}]`;
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key)!.push(row);
  }
  for (const [client, rowsForClient] of byClient) {
    console.log(`  ${client}`);
    for (const row of rowsForClient.slice(0, 6)) {
      console.log(
        `    ${row.line.so_number} | ${row.line.garment} | ${row.line.supplier_id} ${row.line.fabric_number} | ${row.detail}`
      );
    }
    if (rowsForClient.length > 6) console.log(`    ... and ${rowsForClient.length - 6} more`);
  }
}

if (likelyTypos.length > 0) {
  console.log(`\n--- fabric_number_likely_typo (${likelyTypos.length}) ---`);
  for (const pair of [...new Set(likelyTypos)]) console.log(`  ${pair}`);
}

// --- Context, not errors -------------------------------------------------
//
// 1 m is the value most older orders carry. It is not a fault the ERP creates
// (the order form refuses an empty metreage) and almost every such line is
// unpriced, so it costs nothing today. Reported as a shape, for the owner.
const atOneMetre = lines.filter((line) => line.quantity === 1);
console.log(`\n--- context: lines sitting at exactly 1 m ---`);
console.log(
  `  ${atOneMetre.length} of ${lines.length} lines (${((atOneMetre.length / lines.length) * 100).toFixed(1)}%), of which ${atOneMetre.filter((l) => l.unit_price > 0).length} carry a mill price`
);
const byMonth = new Map<string, { one: number; total: number }>();
for (const line of lines) {
  const month = line.order_date.slice(0, 7) || "unknown";
  if (!byMonth.has(month)) byMonth.set(month, { one: 0, total: 0 });
  const bucket = byMonth.get(month)!;
  bucket.total += 1;
  if (line.quantity === 1) bucket.one += 1;
}
for (const [month, bucket] of [...byMonth.entries()].sort()) {
  console.log(`  ${month}: ${bucket.one} of ${bucket.total} lines at 1 m`);
}
