/**
 * Import Drapers stock availability PDF into drapers-hs-ss26.json.
 * Usage: node scripts/import-drapers-stock-pdf.mjs [pdf-path]
 *
 * PDF columns: OUT OF STOCK + date = temp unavailable; SOLD OUT (-) = permanently unavailable.
 */
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";

const pdfPath =
  process.argv[2] ??
  "/Users/ralphrahme/Desktop/Fabrics/Drapers/DrapersItaly_StockUpdate_20260529.pdf";
const catalogPath = path.join("src/data/suppliers/drapers-hs-ss26.json");

if (!fs.existsSync(pdfPath)) {
  console.error(`File not found: ${pdfPath}`);
  process.exit(1);
}

const buf = new Uint8Array(fs.readFileSync(pdfPath));
const { text: rawText } = await new PDFParse(buf).getText();

function normalizeLines(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseRestockDate(value) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function expandFabricTokensInFragment(fragment) {
  const trimmed = fragment.trim();
  if (!trimmed) return [];

  if (/^THIN\d+$/i.test(trimmed)) return [trimmed.toUpperCase()];

  const parts = trimmed.split(/\s*-\s*/).map((part) => part.trim()).filter(Boolean);
  const numericParts = parts.filter((part) => /^\d{5}$/.test(part));

  if (numericParts.length === parts.length && numericParts.length === 2) {
    const start = parseInt(numericParts[0], 10);
    const end = parseInt(numericParts[1], 10);
    if (end >= start && end - start <= 100) {
      const out = [];
      for (let n = start; n <= end; n += 1) out.push(String(n));
      return out;
    }
  }

  return parts
    .filter((part) => /^\d{5}$/.test(part) || /^THIN\d+$/i.test(part))
    .map((part) => part.toUpperCase());
}

function expandBunchRange(startToken, endToken) {
  if (/^THIN/i.test(startToken)) return [startToken.toUpperCase()];
  const start = parseInt(startToken, 10);
  const end = parseInt(endToken, 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 200) return [];
  const out = [];
  for (let n = start; n <= end; n += 1) out.push(String(n));
  return out;
}

function parseStockLine(line) {
  const cleaned = line.replace(/^-\s*/, "").trim();
  if (!cleaned || cleaned === "-") return [];

  const updates = [];
  let remaining = cleaned;

  while (remaining.length > 0) {
    const dateMatch = remaining.match(/\((\d{2}\/\d{2}\/\d{4})\)/);
    if (dateMatch) {
      const before = remaining.slice(0, dateMatch.index).trim();
      const restock_date = parseRestockDate(dateMatch[1]);
      for (const fabric_number of expandFabricTokensInFragment(before)) {
        updates.push({ fabric_number, status: "temp_unavailable", restock_date });
      }
      remaining = remaining.slice(dateMatch.index + dateMatch[0].length).trim();
      continue;
    }

    for (const fabric_number of expandFabricTokensInFragment(remaining)) {
      updates.push({ fabric_number, status: "permanently_unavailable", restock_date: null });
    }
    break;
  }

  return updates;
}

function isBoilerplateLine(line) {
  return (
    /^STOCK UPDATE/i.test(line) ||
    /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/.test(line) ||
    /^BUNCH N\./i.test(line) ||
    /^MAZZETTA N\./i.test(line) ||
    /^OUT OF STOCK/i.test(line) ||
    /^DATA RIENTRO/i.test(line) ||
    /^SOLD OUT/i.test(line) ||
    /^-- \d+ of \d+ --$/i.test(line) ||
    /^©/.test(line) ||
    /^\d+$/.test(line)
  );
}

function parseDrapersStock(text) {
  const lines = normalizeLines(text);
  const updates = new Map();
  let currentRange = null;

  function apply(update) {
    const existing = updates.get(update.fabric_number);
    if (!existing) {
      updates.set(update.fabric_number, update);
      return;
    }
    if (existing.status === "permanently_unavailable") return;
    if (update.status === "permanently_unavailable") {
      updates.set(update.fabric_number, update);
      return;
    }
    if (update.restock_date && (!existing.restock_date || update.restock_date > existing.restock_date)) {
      updates.set(update.fabric_number, update);
    }
  }

  for (const line of lines) {
    if (isBoilerplateLine(line)) continue;

    const rangeMatch = line.match(/^\((\d{5}|THIN\d+)\s*-\s*(\d{5}|THIN\d+)\)$/i);
    if (rangeMatch) {
      currentRange = { start: rangeMatch[1].toUpperCase(), end: rangeMatch[2].toUpperCase() };
      continue;
    }

    if (/^- -\s*$/.test(line) && currentRange) {
      for (const fabric_number of expandBunchRange(currentRange.start, currentRange.end)) {
        apply({ fabric_number, status: "permanently_unavailable", restock_date: null });
      }
      continue;
    }

    if (line === "-") continue;

    if (/[\dA-Z]/.test(line) && (line.includes("-") || /\d{5}/.test(line) || /THIN/i.test(line))) {
      for (const update of parseStockLine(line)) {
        apply(update);
      }
    }
  }

  return updates;
}

const stockUpdates = parseDrapersStock(rawText);
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const importedAt = new Date().toISOString();
const reportDateMatch = rawText.match(/(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}/);
const reportDate = reportDateMatch
  ? `${reportDateMatch[3]}-${reportDateMatch[2]}-${reportDateMatch[1]}`
  : importedAt.slice(0, 10);

let marked = 0;
let tempCount = 0;
let permanentCount = 0;
let missingFromCatalog = 0;

for (const fabric of catalog.fabrics) {
  fabric.stock_status = "in_stock";
  fabric.restock_date = null;
  fabric.stock_updated_at = importedAt;

  const update = stockUpdates.get(fabric.fabric_number);
  if (!update) continue;

  fabric.stock_status = update.status;
  fabric.restock_date = update.restock_date;
  marked += 1;
  if (update.status === "temp_unavailable") tempCount += 1;
  if (update.status === "permanently_unavailable") permanentCount += 1;
}

for (const fabric_number of stockUpdates.keys()) {
  if (!catalog.fabrics.some((fabric) => fabric.fabric_number === fabric_number)) {
    missingFromCatalog += 1;
  }
}

catalog.stock_update = {
  source_file: path.basename(pdfPath),
  imported_at: importedAt,
  report_date: reportDate,
  unavailable_count: marked,
  temp_unavailable_count: tempCount,
  permanently_unavailable_count: permanentCount,
  parsed_unavailable_count: stockUpdates.size,
};

fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

console.log(`✓ Drapers stock update applied → ${catalogPath}`);
console.log(`  Report date: ${reportDate}`);
console.log(`  Parsed unavailable: ${stockUpdates.size}`);
console.log(`  Matched in catalog: ${marked} (${tempCount} temp, ${permanentCount} sold out)`);
console.log(`  Not in catalog: ${missingFromCatalog}`);
console.log(`  In stock (default): ${catalog.fabrics.length - marked}`);

const samples = ["26101", "26105", "26112", "26130", "80001", "60078"];
for (const num of samples) {
  const fabric = catalog.fabrics.find((item) => item.fabric_number === num);
  if (!fabric) {
    console.log(`  ${num}: not in catalog`);
    continue;
  }
  console.log(
    `  ${num}: ${fabric.stock_status}${fabric.restock_date ? ` until ${fabric.restock_date}` : ""}`
  );
}
