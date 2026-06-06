/**
 * Import Loro Piana SS26 price list PDF into supplier catalog JSON.
 * Usage: node scripts/import-loro-piana-pdf.mjs [pdf-path]
 *
 * Style ranges like 781038-781041 expand to 781038, 781039, 781040, 781041.
 * Solbiati linen codes keep a leading S (e.g. S23021).
 */
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";

const pdfPath =
  process.argv[2] ?? "/Users/ralphrahme/Desktop/Fabrics/Loro Piana/PriceList_2852026_175306.pdf";

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

const GRADE_PREFIX = "[A-F]\\s+";
const WIDTH_PATTERN = "\\d{2,3}(?:/\\d{2,3})?";

function expandStyleToken(token) {
  const cleaned = token.replace(/^[A-F]\s+/, "").trim().toUpperCase();
  if (/^S\d{5,6}$/.test(cleaned)) return [cleaned];

  const solbiatiRange = cleaned.match(/^S(\d+)-S(\d+)$/);
  if (solbiatiRange) {
    const start = parseInt(solbiatiRange[1], 10);
    const end = parseInt(solbiatiRange[2], 10);
    const width = Math.max(solbiatiRange[1].length, solbiatiRange[2].length);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
    const out = [];
    for (let n = start; n <= end; n += 1) {
      out.push(`S${String(n).padStart(width, "0")}`);
    }
    return out;
  }

  const match = cleaned.match(/^(\d{6})(?:-(\d{6}))?$/);
  if (!match) return [];
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : start;
  const out = [];
  for (let n = start; n <= end; n += 1) out.push(String(n));
  return out;
}

function parsePrice(value) {
  if (!value) return null;
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}

function parseWeight(value) {
  const match = value?.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function parseWidth(value) {
  const match = value?.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function extractStyleTokens(part) {
  return part
    .trim()
    .split(/\s+/)
    .flatMap((token) => {
      const cleaned = token.replace(/^[A-F]\s+/, "").trim().toUpperCase();
      if (/^S\d{5,6}$/.test(cleaned)) return [cleaned];
      if (/^S\d+-S\d+$/.test(cleaned)) return [cleaned];
      if (/^\d{6}(?:-\d{6})?$/.test(cleaned)) return [cleaned];
      return [];
    });
}

function isBoilerplateLine(line) {
  return (
    /^LORO PIANA S\.P\.A\./i.test(line) ||
    /^PRICE LIST SPRING/i.test(line) ||
    /^Prices valid from/i.test(line) ||
    /^Incoterms 2010/i.test(line) ||
    /^\*\*/.test(line) ||
    /^Description$/i.test(line) ||
    /^EUR$/i.test(line) ||
    /^Style Custom Tariff/i.test(line) ||
    /^\d+\/40$/i.test(line) ||
    /^-- \d+ of \d+ --$/i.test(line) ||
    /^CM\.$/i.test(line) ||
    /^GRS\/MTR$/i.test(line)
  );
}

function parseLoroPiana(text) {
  const fabrics = [];
  const lines = normalizeLines(text);

  let bunchNumber = null;
  let bunchName = null;
  let pendingGn = null;
  let pendingStyles = [];
  let pendingEntry = null;
  let lastCompletedEntry = null;

  let lastFlushedCount = 0;

  function flushPending(price) {
    if (!pendingEntry || pendingEntry.styles.length === 0) return;
    const composition = pendingEntry.composition.replace(/\s+/g, " ").trim();
    for (const style of pendingEntry.styles) {
      for (const fabric_number of expandStyleToken(style)) {
        fabrics.push({
          fabric_number,
          book_number: bunchNumber,
          collection: bunchName,
          composition,
          color: null,
          description: `${bunchName} — ${composition}`,
          weight_gsm: pendingEntry.weight,
          width_cm: pendingEntry.width,
          gn_code: null,
          unit_price: price,
          unit: "meters",
          currency: "EUR",
          is_active: price != null,
          category: bunchName?.toLowerCase() ?? null,
        });
      }
    }
    if (price != null && pendingEntry.width != null) {
      lastCompletedEntry = {
        width: pendingEntry.width,
        weight: pendingEntry.weight,
        composition: pendingEntry.composition.replace(/\s+/g, " ").trim(),
        price,
      };
    }
    lastFlushedCount = fabrics.length;
    pendingEntry = null;
    pendingStyles = [];
  }

  function flushOrphanStyles() {
    if (pendingStyles.length === 0 || !lastCompletedEntry) return;
    pendingEntry = {
      styles: [...pendingStyles],
      width: lastCompletedEntry.width,
      weight: lastCompletedEntry.weight,
      composition: lastCompletedEntry.composition,
    };
    pendingStyles = [];
    flushPending(lastCompletedEntry.price);
  }

  for (const line of lines) {
    if (isBoilerplateLine(line)) continue;

    const bunchMatch = line.match(/^(\d{3})\s+(.+?)\s+Bunch$/i);
    if (bunchMatch) {
      const nextBunchNumber = bunchMatch[1];
      const nextBunchName = bunchMatch[2].trim();

      if (bunchNumber && nextBunchNumber !== bunchNumber) {
        flushPending(null);
        flushOrphanStyles();
        lastCompletedEntry = null;
        pendingStyles = [];
        pendingEntry = null;
      }

      bunchNumber = nextBunchNumber;
      bunchName = nextBunchName;
      pendingGn = null;
      continue;
    }

    const gnMatch = line.match(/^\(\*\)\s+(\d+)/);
    if (gnMatch) {
      pendingGn = gnMatch[1];
      if (lastFlushedCount > 0) {
        for (let i = fabrics.length - lastFlushedCount; i < fabrics.length; i += 1) {
          fabrics[i].gn_code = pendingGn;
        }
        lastFlushedCount = 0;
      }
      continue;
    }

    const priceOnly = line.match(/^([\d]+,[\d]{2})$/);
    if (priceOnly && pendingEntry) {
      flushPending(parsePrice(priceOnly[1]));
      continue;
    }

    const withPrice = line.match(
      new RegExp(
        `^(?:${GRADE_PREFIX})?((?:(?:S\\d+-S\\d+|S\\d{5,6}|\\d{6})(?:-\\d{6})?\\s*)+)\\s+(${WIDTH_PATTERN})\\s+(\\d+(?:/\\d+)?)\\s+(.+?)(?:\\t|\\s+)([\\d]+,[\\d]{2})$`
      )
    );
    if (withPrice) {
      flushOrphanStyles();
      flushPending(null);
      pendingEntry = {
        styles: [...pendingStyles, ...extractStyleTokens(withPrice[1])],
        width: parseWidth(withPrice[2]),
        weight: parseWeight(withPrice[3]),
        composition: withPrice[4].trim(),
      };
      flushPending(parsePrice(withPrice[5]));
      continue;
    }

    const withoutPrice = line.match(
      new RegExp(
        `^(?:${GRADE_PREFIX})?((?:(?:S\\d+-S\\d+|S\\d{5,6}|\\d{6})(?:-\\d{6})?\\s*)+)\\s+(${WIDTH_PATTERN})\\s+(\\d+(?:/\\d+)?)\\s+(.+)$`
      )
    );
    if (withoutPrice) {
      flushOrphanStyles();
      flushPending(null);
      pendingEntry = {
        styles: [...pendingStyles, ...extractStyleTokens(withoutPrice[1])],
        width: parseWidth(withoutPrice[2]),
        weight: parseWeight(withoutPrice[3]),
        composition: withoutPrice[4].trim(),
      };
      pendingStyles = [];
      continue;
    }

    const stylesOnly = line.match(
      new RegExp(`^(?:${GRADE_PREFIX})?((?:(?:S\\d+-S\\d+|S\\d{5,6}|\\d{6})(?:-\\d{6})?\\s*)+)$`)
    );
    if (stylesOnly) {
      pendingStyles.push(...extractStyleTokens(stylesOnly[1]));
      continue;
    }

    if (pendingEntry && !/^\d/.test(line)) {
      pendingEntry.composition = `${pendingEntry.composition} ${line}`.trim();
      continue;
    }
  }

  flushOrphanStyles();
  flushPending(null);

  const seen = new Set();
  return fabrics.filter((fabric) => {
    if (seen.has(fabric.fabric_number)) return false;
    seen.add(fabric.fabric_number);
    return true;
  });
}

const fabrics = parseLoroPiana(rawText);
const outPath = path.join("src/data/suppliers/loro-piana-ss26.json");

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      document_type: "price_list",
      supplier: {
        code: "LORO-PIANA",
        name: "Loro Piana",
        country: "Italy",
        is_fabric_supplier: true,
        lead_time_days: 14,
        currency: "EUR",
      },
      price_list_name: "SS26 Price List",
      imported_at: new Date().toISOString(),
      source_file: path.basename(pdfPath),
      fabric_count: fabrics.length,
      fabrics,
    },
    null,
    2
  )}\n`
);

console.log(`✓ Loro Piana SS26: ${fabrics.length} fabrics → ${outPath}`);
const sampleRange = ["781038", "781039", "781040", "781041", "703010", "703018"];
for (const num of sampleRange) {
  const hit = fabrics.find((f) => f.fabric_number === num);
  console.log(`  ${num}: ${hit ? `€${hit.unit_price}` : "missing"}`);
}
