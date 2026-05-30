/**
 * Import supplier price list PDFs into JSON.
 * Supports: Caccioppoli (jackets + shirting), Zegna, Drapers (HS codes + price list)
 */
import { getDocument } from "/private/tmp/package/legacy/build/pdf.mjs";
import fs from "fs";
import path from "path";

async function extractText(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  let allText = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    allText += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return allText.replace(/\s+/g, " ");
}

function parseCaccioppoliJackets(text) {
  const parts = text.split(/(?=Caccioppoli\s+\d{6})/g);
  const fabrics = [];
  for (const part of parts) {
    const tail = part.match(
      /^Caccioppoli\s+(\d{6})\s+(.+?)\s+(NO|YES)\s+(\d{8,10})\s+(€\s*[\d.]+|discontinued)/i
    );
    if (!tail) continue;
    const fabric_number = tail[1];
    const beforeNap = tail[2].trim();
    const gn_code = tail[4];
    const priceRaw = tail[5].trim();
    const unit_price = priceRaw.toLowerCase().includes("discontinued")
      ? null
      : parseFloat(priceRaw.replace(/[^\d.]/g, ""));

    const widthMatch = beforeNap.match(/(.+?)\s+(\d{2,3})\s+(\d{2,3})$/);
    if (!widthMatch) continue;

    const prefix = widthMatch[1].trim();
    const weight_gsm = parseFloat(widthMatch[2]);
    const width_cm = parseFloat(widthMatch[3]);

    const compMatch = prefix.match(/^([\d%.a-z\-]+(?:\.[\d%.a-z\-]+)*\.?)\s+(.+)$/i);
    let composition = "";
    let rest = prefix;
    if (compMatch) {
      composition = compMatch[1].replace(/\.$/, "").trim();
      rest = compMatch[2].trim();
    }

    let color = rest;
    let description = rest;
    const simple = rest.match(
      /^(.+?)\s+(plain|stripe|windowpane|check|piedpull|opsack|tweed|fancy printed|Prince of wales check)(?:\s+(\d+[xX]\d+))?\s*$/i
    );
    if (simple) {
      color = simple[1].trim();
      description = [simple[2], simple[3]].filter(Boolean).join(" ").trim();
    }

    fabrics.push({
      fabric_number,
      composition,
      color,
      description,
      weight_gsm,
      width_cm,
      gn_code,
      unit_price,
      unit: "meters",
      currency: "EUR",
      is_active: unit_price !== null,
      category: "jackets",
    });
  }
  return dedupe(fabrics);
}

function parseCaccioppoliShirting(text) {
  const parts = text.split(/(?=Caccioppoli\s+\d{4}\s+)/g);
  const fabrics = [];
  for (const part of parts) {
    const m = part.match(
      /Caccioppoli\s+(\d{4})\s+(\w+)\s+(\d{6})\s+(.+?)\s+(\d+)\s*cm\s+\w+.*?gr\.(\d+)\s+€\s*([\d.]+|discontinued)/i
    );
    if (!m) continue;
    const unit_price = m[7].toLowerCase().includes("discontinued")
      ? null
      : parseFloat(m[7]);
    const fabricDesc = m[4].trim();
    const compMatch = fabricDesc.match(/^(.+?\d+%[a-z.\-]+(?:\([^)]+\))?)/i);
    fabrics.push({
      fabric_number: m[3],
      book_number: m[1],
      composition: compMatch ? compMatch[1].trim() : fabricDesc,
      color: null,
      description: `${m[2]} — ${fabricDesc}`,
      weight_gsm: parseFloat(m[6]),
      width_cm: parseFloat(m[5]),
      gn_code: null,
      unit_price,
      unit: "meters",
      currency: "EUR",
      is_active: unit_price !== null,
      category: "shirting",
    });
  }
  return dedupe(fabrics);
}

function parseZegna(text) {
  const fabrics = [];
  // Match article lines: 66001-66014▪ 163,40 300 150 composition COLLECTION
  const regex =
    /(\d{5}(?:-\d{2,5})?)\s*▪?\s+([\d,\.]+)\s+([\d/]+)\s+(\d{3})\s+(.+?)\s+([A-Z][A-Z0-9\s\-]{2,40})(?=\s+\d{5}|\s+N\.\s|\s+PRICE|$)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const unit_price = parseFloat(m[2].replace(",", "."));
    const weightRaw = m[3];
    const weight_gsm = parseFloat(weightRaw.split("/")[0]);
    fabrics.push({
      fabric_number: m[1].replace("▪", ""),
      composition: m[5].trim(),
      color: null,
      description: m[6].trim(),
      weight_gsm,
      width_cm: parseFloat(m[4]),
      gn_code: null,
      unit_price,
      unit: "meters",
      currency: "USD",
      is_active: true,
      category: "suiting",
    });
  }

  // Fallback: simpler line-by-line for Zegna
  if (fabrics.length < 10) {
    const lines = text.split(/(?=\d{5})/);
    for (const line of lines) {
      const lm = line.match(
        /^(\d{5}(?:-\d{5})?)\s*▪?\s+([\d,\.]+)\s+([\d/]+)\s+(\d{3})\s+(.+?)\s+([A-Z][A-Z0-9\s\-]{2,})$/
      );
      if (!lm) continue;
      fabrics.push({
        fabric_number: lm[1].replace("▪", ""),
        composition: lm[5].trim(),
        color: null,
        description: lm[6].trim(),
        weight_gsm: parseFloat(lm[3].split("/")[0]),
        width_cm: parseFloat(lm[4]),
        gn_code: null,
        unit_price: parseFloat(lm[2].replace(",", ".")),
        unit: "meters",
        currency: "USD",
        is_active: true,
        category: "suiting",
      });
    }
  }
  return dedupe(fabrics);
}

function parseDrapers(text) {
  const body = text.replace(/^.*?Descrizione Gruppo Merceologico\s+/i, "");
  const parts = body.split(/(?=\b\d{2,3}\s+[A-Z]{2}\d{2}\s+-\s+)/);
  const fabrics = [];
  for (const part of parts) {
    const m = part.match(
      /^(\d{2,3})\s+([A-Z0-9]+\s+-\s+[A-Z0-9\s&]+?)\s+(\d{5})\s+([\d,]+)\s+((?:\d+%\s*[A-Z]{2,3}\s*)+)\s+([\w\-\.\/]+)\s+(\d{5})\s+([A-Z][A-Z\s\.]+?)\s+(\d{8})\s+([\d,]+)\s+(\d+)\s+([A-Z\s]+?)(?=\s+\d{2,3}\s+[A-Z]{2}\d{2}\s+-|\s*$)/
    );
    if (!m) continue;
    const widthM = parseFloat(m[10].replace(",", "."));
    fabrics.push({
      fabric_number: m[3],
      book_number: m[1],
      collection: m[2].trim(),
      composition: m[5].trim(),
      mill_code: m[6],
      mill_name: m[8].trim(),
      gn_code: m[9],
      width_cm: Math.round(widthM * 100),
      weight_linear: m[4],
      color: null,
      description: `${m[2].trim()} — ${m[12].trim()} (${m[6]})`,
      unit_price: null,
      unit: "meters",
      currency: "EUR",
      is_active: true,
      category: m[12].trim(),
    });
  }
  return dedupe(fabrics);
}

function parseDrapersPriceList(text) {
  const body = text.replace(/^.*?Composizione\s+/i, "");
  const rowRegex =
    /(\d+|ZZ|NN)\s+([A-Z0-9][A-Z0-9\s'\d]+?)\s+(\d{5})\s+(\d{5})\s+([\d,]+)\s*€\s+(\d+)\s+(\d+)\s+((?:\d+%[^0-9]+?)+?)(?=\s+(?:\d+|ZZ|NN)\s+[A-Z]|$)/g;
  const priceMap = new Map();
  let m;
  while ((m = rowRegex.exec(body)) !== null) {
    const from = parseInt(m[3], 10);
    const to = parseInt(m[4], 10);
    const entry = {
      unit_price: parseFloat(m[5].replace(",", ".")),
      weight_gsm: parseInt(m[6], 10),
      width_cm: parseInt(m[7], 10),
      composition: m[8].trim(),
      collection: m[2].trim(),
      book_number: m[1],
    };
    for (let n = from; n <= to; n++) {
      priceMap.set(String(n), entry);
    }
  }
  return priceMap;
}

function mergeDrapersCatalog(hsFabrics, priceMap) {
  const byNumber = new Map();

  for (const fabric of hsFabrics) {
    byNumber.set(fabric.fabric_number, { ...fabric });
  }

  for (const [fabricNumber, price] of priceMap) {
    const existing = byNumber.get(fabricNumber);
    if (existing) {
      byNumber.set(fabricNumber, {
        ...existing,
        unit_price: price.unit_price,
        weight_gsm: price.weight_gsm,
        width_cm: price.width_cm,
        composition: existing.composition || price.composition,
        is_active: true,
      });
      continue;
    }

    byNumber.set(fabricNumber, {
      fabric_number: fabricNumber,
      book_number: price.book_number,
      collection: price.collection,
      composition: price.composition,
      mill_code: null,
      mill_name: null,
      gn_code: null,
      width_cm: price.width_cm,
      weight_gsm: price.weight_gsm,
      color: null,
      description: price.collection,
      unit_price: price.unit_price,
      unit: "meters",
      currency: "EUR",
      is_active: true,
      category: null,
    });
  }

  return [...byNumber.values()].sort((a, b) =>
    a.fabric_number.localeCompare(b.fabric_number, undefined, { numeric: true })
  );
}

function dedupe(fabrics) {
  const seen = new Set();
  return fabrics.filter((f) => {
    if (seen.has(f.fabric_number)) return false;
    seen.add(f.fabric_number);
    return true;
  });
}

function writeCatalog(outPath, meta, fabrics) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        document_type: "price_list",
        ...meta,
        fabric_count: fabrics.length,
        fabrics,
      },
      null,
      2
    )
  );
  console.log(`✓ ${meta.supplier.name} — ${meta.price_list_name}: ${fabrics.length} items → ${outPath}`);
}

const outDir = path.join("src/data/suppliers");

// 1. Caccioppoli Jackets (from Desktop)
const jacketsPath =
  "/Users/ralphrahme/Desktop/Fabrics/Caccioppoli /Caccioppoli Price list SS26 - D.pdf";
const jacketsText = await extractText(jacketsPath);
const jackets = parseCaccioppoliJackets(jacketsText);
writeCatalog(path.join(outDir, "caccioppoli-jackets-ss26.json"), {
  supplier: {
    code: "CACCIOPPOLI",
    name: "Caccioppoli",
    country: "Italy",
    is_fabric_supplier: true,
    lead_time_days: 14,
    currency: "EUR",
  },
  price_list_name: "SS26 Jackets - D",
  imported_at: new Date().toISOString(),
  source_file: "Caccioppoli Price list SS26 - D.pdf",
}, jackets);

// 2. Caccioppoli Shirting
const shirtingPath =
  "/Users/ralphrahme/Desktop/Fabrics/Caccioppoli /Caccioppoli SHIRTING SS26 PRICE LIST _ D.pdf";
const shirtingText = await extractText(shirtingPath);
const shirting = parseCaccioppoliShirting(shirtingText);
writeCatalog(path.join(outDir, "caccioppoli-shirting-ss26.json"), {
  supplier: {
    code: "CACCIOPPOLI",
    name: "Caccioppoli",
    country: "Italy",
    is_fabric_supplier: true,
    lead_time_days: 14,
    currency: "EUR",
  },
  price_list_name: "SS26 Shirting - D",
  imported_at: new Date().toISOString(),
  source_file: "Caccioppoli SHIRTING SS26 PRICE LIST _ D.pdf",
}, shirting);

// 3. Zegna
const zegnaPath = "/Users/ralphrahme/Desktop/Fabrics/Zegna/Zegna price list.pdf";
const zegnaText = await extractText(zegnaPath);
const zegna = parseZegna(zegnaText);
writeCatalog(path.join(outDir, "zegna-ss26.json"), {
  supplier: {
    code: "ZEGNA",
    name: "Zegna",
    country: "Italy",
    is_fabric_supplier: true,
    lead_time_days: 14,
    currency: "USD",
  },
  price_list_name: "SS26 Quick-Lengths",
  imported_at: new Date().toISOString(),
  source_file: "Zegna price list.pdf",
}, zegna);

// 4. Drapers — merge HS codes with PE26 price list
const drapersHsPath = "/Users/ralphrahme/Desktop/Fabrics/Drapers/HS CODES SS26.pdf";
const drapersPricePath = "/Users/ralphrahme/Desktop/Fabrics/Drapers/PE26 - Listino DST.pdf";
const drapersHsText = await extractText(drapersHsPath);
const drapersPriceText = await extractText(drapersPricePath);
const drapersHs = parseDrapers(drapersHsText);
const drapersPrices = parseDrapersPriceList(drapersPriceText);
const drapers = mergeDrapersCatalog(drapersHs, drapersPrices);
writeCatalog(path.join(outDir, "drapers-hs-ss26.json"), {
  supplier: {
    code: "DRAPERS",
    name: "Drapers",
    country: "Italy",
    is_fabric_supplier: true,
    lead_time_days: 14,
    currency: "EUR",
  },
  price_list_name: "SS26 HS + Prices",
  imported_at: new Date().toISOString(),
  source_file: "HS CODES SS26.pdf + PE26 - Listino DST.pdf",
}, drapers);

console.log(
  "\nDone. Jackets:", jackets.length,
  "Shirting:", shirting.length,
  "Zegna:", zegna.length,
  "Drapers:", drapers.length,
  `(HS: ${drapersHs.length}, prices: ${drapersPrices.size})`
);
