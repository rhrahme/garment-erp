/**
 * Import Gazaba cutlength general price list PDF into supplier catalog JSON.
 *
 * Usage:
 *   node scripts/import-gazaba-price-list.mjs [pdf-path]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFParse } from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const DEFAULT_PDF = path.join(
  process.env.HOME ?? "",
  "Desktop",
  "Fabrics",
  "Gazaba",
  "Gazaba Cutlength General Price List(AED).pdf"
);
const OUT_PATH = path.join(ROOT, "src/data/suppliers/gazaba-cutlength-price-list.json");

const SECTION_HEADERS = new Set([
  "shirt fabric",
  "chino collection",
  "chiNO cOllectiON".toLowerCase(),
  "wool / polyester suiting",
  "wool / polyester suiting".replace(/\s+/g, " "),
  "jersey & technical fabric",
  "jersey & technical fabric".replace(/\s+/g, " "),
]);

function clean(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeSection(line) {
  return line.replace(/\s+/g, " ").trim().toLowerCase();
}

function isSectionHeader(line) {
  const normalized = normalizeSection(line);
  if (SECTION_HEADERS.has(normalized)) return true;
  return /^(shirt fabric|chino collection|wool\s*\/\s*polyester suiting|jersey\s*&\s*technical fabric)$/i.test(
    line.trim()
  );
}

function isBoilerplate(line) {
  return (
    /^GAZABA GENERAL PRICE LIST/i.test(line) ||
    /^VALID UNTIL/i.test(line) ||
    /^IN UAE DIRHAMS/i.test(line) ||
    /^BOOK\s+SKU/i.test(line) ||
    /^Page \d+$/i.test(line) ||
    /^-- \d+ of \d+ --$/i.test(line)
  );
}

function parseWeight(raw) {
  const text = clean(raw);
  if (!text) return { weight_gsm: null, weight_linear: null };

  const rangeMatch = text.match(/(\d+)\s*-\s*(\d+)\s*G(?:\/M|M)?/i);
  if (rangeMatch) {
    const low = parseInt(rangeMatch[1], 10);
    const high = parseInt(rangeMatch[2], 10);
    return {
      weight_gsm: Math.round((low + high) / 2),
      weight_linear: `${low}-${high} g/m`,
    };
  }

  const singleMatch = text.match(/(\d+)\s*G(?:\/M|M)?/i);
  if (singleMatch) {
    const weight = parseInt(singleMatch[1], 10);
    return { weight_gsm: weight, weight_linear: `${weight} g/m` };
  }

  return { weight_gsm: null, weight_linear: text };
}

function normalizeSku(raw) {
  const sku = clean(raw);
  if (!sku) return null;
  return sku.replace(/\s+/g, " ").toUpperCase();
}

function uniqueFabricNumber(sku, composition, seen) {
  const base = normalizeSku(sku);
  if (!base) return null;

  let candidate = base;
  let variant = 2;
  while (seen.has(candidate.toLowerCase())) {
    candidate = `${base}/v${variant}`;
    variant += 1;
  }
  seen.add(candidate.toLowerCase());
  return candidate;
}

function buildDescription({ book, sku, composition, weight_linear, section, cutlength_price }) {
  const parts = [];
  if (section) parts.push(section);
  if (book && book.toUpperCase() !== sku?.toUpperCase()) parts.push(book);
  if (composition) parts.push(composition);
  if (weight_linear) parts.push(`(${weight_linear})`);
  parts.push(`cutlength ${cutlength_price} AED`);
  return parts.join(" — ");
}

function parsePriceList(text) {
  const lines = text
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let section = null;
  const fabrics = [];
  const seenNumbers = new Set();

  for (const line of lines) {
    if (isBoilerplate(line)) continue;
    if (isSectionHeader(line)) {
      section = line.replace(/\s+/g, " ").trim();
      continue;
    }
    if (!line.endsWith("AED")) continue;

    const parts = line.split(/\t+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 4) continue;

    const priceRaw = parts[parts.length - 2];
    const unit_price = parseFloat(priceRaw);
    if (!Number.isFinite(unit_price)) continue;

    let book;
    let sku;
    let composition;
    let weightRaw = null;

    if (parts.length === 5) {
      [book, sku, composition] = parts;
    } else if (parts.length === 6) {
      [book, sku, composition, weightRaw] = parts;
    } else {
      continue;
    }

    const normalizedSku = normalizeSku(sku);
    const fabric_number = uniqueFabricNumber(normalizedSku, composition, seenNumbers);
    if (!fabric_number) continue;

    const { weight_gsm, weight_linear } = parseWeight(weightRaw);

    fabrics.push({
      fabric_number,
      sku_pattern: normalizedSku,
      composition: clean(composition),
      color: null,
      description: buildDescription({
        book: clean(book),
        sku: normalizedSku,
        composition: clean(composition),
        weight_linear,
        section,
        cutlength_price: unit_price,
      }),
      weight_gsm,
      weight_linear,
      width_cm: null,
      collection: clean(book),
      category: section,
      unit_price,
      unit: "cutlength",
      currency: "AED",
      is_active: true,
    });
  }

  fabrics.sort((a, b) => a.fabric_number.localeCompare(b.fabric_number, undefined, { numeric: true }));
  return expandSkuPlaceholders(fabrics);
}

/** Expand PDF placeholder SKUs (e.g. PAL.XXX) into orderable fabric numbers. */
function expandSkuPlaceholders(fabrics) {
  const EXPANSIONS = {
    "PAL.XXX": { prefix: "PAL.", from: 1, to: 35 },
  };

  const out = [];
  for (const fabric of fabrics) {
    const pattern = fabric.sku_pattern ?? fabric.fabric_number;
    const expansion = EXPANSIONS[pattern];
    if (!expansion) {
      out.push(fabric);
      continue;
    }

    for (let n = expansion.from; n <= expansion.to; n += 1) {
      const num = String(n).padStart(3, "0");
      const fabric_number = `${expansion.prefix}${num}`;
      out.push({
        ...fabric,
        fabric_number,
        sku_pattern: pattern,
        description: fabric.description?.replace(pattern, fabric_number) ?? fabric.description,
      });
    }
  }

  out.sort((a, b) => a.fabric_number.localeCompare(b.fabric_number, undefined, { numeric: true }));
  return out;
}

async function extractPdfText(pdfPath) {
  const buf = new Uint8Array(fs.readFileSync(pdfPath));
  const { text } = await new PDFParse(buf).getText();
  return text;
}

async function main() {
  const pdfPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_PDF;
  if (!fs.existsSync(pdfPath)) {
    console.error(`File not found: ${pdfPath}`);
    process.exit(1);
  }

  const text = await extractPdfText(pdfPath);
  const fabrics = parsePriceList(text);

  const payload = {
    document_type: "price_list",
    supplier: {
      code: "GZB",
      name: "Gazaba",
      country: "Italy",
      is_fabric_supplier: true,
      lead_time_days: 14,
      currency: "AED",
    },
    price_list_name: "Cutlength General Price List (AED)",
    imported_at: new Date().toISOString(),
    source_file: path.basename(pdfPath),
    fabric_count: fabrics.length,
    fabrics,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const sample = fabrics.slice(0, 5).map((f) => `${f.fabric_number}: ${f.unit_price} AED`);
  console.log(`Gazaba: ${fabrics.length} fabrics -> ${OUT_PATH}`);
  console.log(`Sample: ${sample.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
