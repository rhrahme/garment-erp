/**
 * Import Caccioppoli "Esauriti" stock-update PDFs into local catalog JSON.
 *
 * Prefer live API sync when CACCIOPPOLI_API_TOKEN is set:
 *   Purchasing → Supplier Emails → Caccioppoli live stock API → Sync full SS26 catalogs
 *   or POST /api/integrations/caccioppoli/sync-stock { "scope": "catalog" }
 *
 * Usage:
 *   node scripts/import-caccioppoli-stock-pdf.mjs [pdf...]
 *   node scripts/import-caccioppoli-stock-pdf.mjs "/path/to/Esauriti-Camiceria-E.pdf"
 *
 * Fabric code = 4-digit book + 2-digit pattern (e.g. book 2061 pattern 07 → 206107).
 * Sold-out patterns → permanently_unavailable; patterns with (date) → temp_unavailable.
 */
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";

/** SS26 only — matches initial shirting + jackets price lists (Estate/Primavera 2026). */
const DEFAULT_PDFS = [
  "reference-documents/Caccioppoli/stock update/Esauriti-Camiceria-E.pdf",
  "reference-documents/Caccioppoli/stock update/Esauriti-Drapperia-E.pdf",
];

const CATALOGS = [
  "src/data/suppliers/caccioppoli-shirting-ss26.json",
  "src/data/suppliers/caccioppoli-jackets-ss26.json",
];

const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jne: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function normalizeLines(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[’']/g, "'")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseEnglishDate(dayStr, monthStr, yearSuffix) {
  const day = parseInt(dayStr, 10);
  const month = MONTHS[monthStr.toLowerCase()];
  if (!month || !Number.isFinite(day)) return null;
  let year = 2026;
  if (yearSuffix) {
    const yy = parseInt(yearSuffix, 10);
    year = yy < 50 ? 2000 + yy : 1900 + yy;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fabricCode(book, pattern) {
  const p = String(pattern).replace(/^\*/, "").padStart(2, "0");
  return `${book}${p}`;
}

function applyUpdate(map, update) {
  const existing = map.get(update.fabric_number);
  if (!existing) {
    map.set(update.fabric_number, update);
    return;
  }
  if (existing.status === "permanently_unavailable") return;
  if (update.status === "permanently_unavailable") {
    map.set(update.fabric_number, update);
    return;
  }
  if (update.restock_date && (!existing.restock_date || update.restock_date > existing.restock_date)) {
    map.set(update.fabric_number, update);
  }
}

function parseFragment(book, fragment) {
  const updates = [];
  if (!fragment?.trim()) return updates;

  const tempPatterns = [];
  const dateRe =
    /\*?(\d{1,2})\s*\(\s*(\d{1,2})\s+([A-Za-z]+)(?:\s*'(\d{2}))?\s*\)/gi;
  let match;
  let stripped = fragment;
  while ((match = dateRe.exec(fragment)) !== null) {
    const pattern = match[1].padStart(2, "0");
    const restock_date = parseEnglishDate(match[2], match[3], match[4]);
    tempPatterns.push({ pattern, restock_date });
    stripped = stripped.replace(match[0], " ");
  }

  for (const { pattern, restock_date } of tempPatterns) {
    updates.push({
      fabric_number: fabricCode(book, pattern),
      status: "temp_unavailable",
      restock_date,
    });
  }

  stripped = stripped
    .replace(/→\s*\d+/g, " ")
    .replace(/[A-Za-z/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const token of stripped.split(/[,\s]+/)) {
    const cleaned = token.replace(/^\*/, "").trim();
    if (!/^\d{1,2}$/.test(cleaned)) continue;
    const pattern = cleaned.padStart(2, "0");
    if (tempPatterns.some((item) => item.pattern === pattern)) continue;
    updates.push({
      fabric_number: fabricCode(book, pattern),
      status: "permanently_unavailable",
      restock_date: null,
    });
  }

  return updates;
}

function isBoilerplate(line) {
  return (
    /^29\/05\/\d{4}$/.test(line) ||
    /^Camiceria/i.test(line) ||
    /^Drapperia/i.test(line) ||
    /^Fall\/Winter|^Spring\/Summer|^Autunno|^Primavera/i.test(line) ||
    /^\*/.test(line) && line.includes("nuovo sospeso") ||
    /^nb:/i.test(line) ||
    /^Numero|^Book|^Nome|^Articoli|^Patterns|^Temporarily|^Sostituzioni|^Suggestions|^Replacement|^N\.Mazz/i.test(
      line
    ) ||
    /^-- \d+ of \d+ --$/.test(line) ||
    /^Mazzetta$/.test(line) ||
    /^number$|^name$|^name$|^sold out$|^Delayed$|^for pending$/i.test(line)
  );
}

function parseCaccioppoliStock(text) {
  const lines = normalizeLines(text);
  const updates = new Map();
  let currentBook = null;
  let buffer = "";

  function flush() {
    if (!currentBook || !buffer.trim()) return;
    for (const update of parseFragment(currentBook, buffer)) {
      applyUpdate(updates, update);
    }
    buffer = "";
  }

  for (const line of lines) {
    if (isBoilerplate(line)) continue;

    const bookLine = line.match(/^(\d{4})\s+(.+)$/);
    if (bookLine) {
      flush();
      currentBook = bookLine[1];
      buffer = bookLine[2];
      continue;
    }

    if (currentBook) {
      if (/^\d{1,2}[→]/.test(line) || /→\s*\d{6}/.test(line)) {
        buffer += ` ${line}`;
        continue;
      }
      if (/^[\d,*\s(),A-Za-z'’\-]+$/.test(line)) {
        buffer += ` ${line}`;
      }
    }
  }
  flush();

  return updates;
}

async function extractPdfText(pdfPath) {
  const buf = new Uint8Array(fs.readFileSync(pdfPath));
  const { text } = await new PDFParse(buf).getText();
  return text;
}

const pdfPaths = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_PDFS;
const existingPdfs = pdfPaths.filter((p) => fs.existsSync(p));
if (existingPdfs.length === 0) {
  console.error("No PDF files found.");
  process.exit(1);
}

const merged = new Map();
const sources = [];

for (const pdfPath of existingPdfs) {
  const text = await extractPdfText(pdfPath);
  const parsed = parseCaccioppoliStock(text);
  for (const [fabric_number, update] of parsed) {
    applyUpdate(merged, update);
  }
  sources.push(path.basename(pdfPath));
  console.log(`  Parsed ${path.basename(pdfPath)}: ${parsed.size} unavailable lines`);
}

const importedAt = new Date().toISOString();
const reportDateMatch = (await extractPdfText(existingPdfs[0])).match(/(\d{2})\/(\d{2})\/(\d{4})/);
const reportDate = reportDateMatch
  ? `${reportDateMatch[3]}-${reportDateMatch[2]}-${reportDateMatch[1]}`
  : importedAt.slice(0, 10);

for (const catalogPath of CATALOGS) {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  let marked = 0;
  let tempCount = 0;
  let permanentCount = 0;

  for (const fabric of catalog.fabrics) {
    fabric.stock_status = "in_stock";
    fabric.restock_date = null;
    fabric.stock_updated_at = importedAt;

    const update = merged.get(fabric.fabric_number);
    if (!update) continue;

    fabric.stock_status = update.status;
    fabric.restock_date = update.restock_date;
    marked += 1;
    if (update.status === "temp_unavailable") tempCount += 1;
    if (update.status === "permanently_unavailable") permanentCount += 1;
  }

  const fabricNumbers = new Set(catalog.fabrics.map((f) => f.fabric_number));
  let missingFromCatalog = 0;
  for (const fabric_number of merged.keys()) {
    if (!fabricNumbers.has(fabric_number)) missingFromCatalog += 1;
  }

  catalog.stock_update = {
    source_files: sources,
    imported_at: importedAt,
    report_date: reportDate,
    unavailable_count: marked,
    temp_unavailable_count: tempCount,
    permanently_unavailable_count: permanentCount,
    parsed_unavailable_count: merged.size,
    not_in_this_catalog: missingFromCatalog,
  };

  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

  console.log(`\n✓ ${catalogPath}`);
  console.log(`  Matched: ${marked} (${tempCount} temp, ${permanentCount} sold out)`);
  console.log(`  In stock: ${catalog.fabrics.length - marked}`);
  console.log(`  Parsed but not in this catalog: ${missingFromCatalog}`);
}

console.log(`\nTotal parsed unavailable codes: ${merged.size}`);
console.log(`Report date: ${reportDate}`);
