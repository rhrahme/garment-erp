/**
 * Import a supplier price list PDF into JSON for the ERP catalog.
 * Usage: node scripts/import-pdf-price-list.mjs <pdf-path> <supplier-slug>
 */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";
import path from "path";

const [pdfPath, supplierSlug = "supplier"] = process.argv.slice(2);
if (!pdfPath) {
  console.error("Usage: node scripts/import-pdf-price-list.mjs <pdf-path> [supplier-slug]");
  process.exit(1);
}

const data = new Uint8Array(fs.readFileSync(pdfPath));
const doc = await getDocument({ data, useSystemFonts: true }).promise;

let allText = "";
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  allText += content.items.map((it) => it.str).join(" ") + "\n";
}
allText = allText.replace(/\s+/g, " ");

const parts = allText.split(/(?=Caccioppoli\s+\d{6})/g);
const fabrics = [];

for (const part of parts) {
  const tail = part.match(
    /^Caccioppoli\s+(\d{6})\s+(.+?)\s+(NO|YES)\s+(\d{8,10})\s+(€\s*[\d\.]+|discontinued)/i
  );
  if (!tail) continue;

  const fabric_number = tail[1];
  const beforeNap = tail[1] === fabric_number ? tail[2].trim() : tail[2].trim();
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
  });
}

const seen = new Set();
const unique = fabrics.filter((f) => {
  if (seen.has(f.fabric_number)) return false;
  seen.add(f.fabric_number);
  return true;
});

const outDir = path.join("src/data/suppliers");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${supplierSlug}.json`);

fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      supplier: {
        code: supplierSlug.toUpperCase(),
        name: supplierSlug.charAt(0).toUpperCase() + supplierSlug.slice(1),
        country: "Italy",
        is_fabric_supplier: true,
        lead_time_days: 14,
        currency: "EUR",
      },
      imported_at: new Date().toISOString(),
      source_file: path.basename(pdfPath),
      fabric_count: unique.length,
      fabrics: unique,
    },
    null,
    2
  )
);

console.log(`Imported ${unique.length} fabrics → ${outPath}`);
