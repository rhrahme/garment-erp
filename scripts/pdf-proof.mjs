/**
 * Reproduce the failing fabric-cuts sticker PDF with the fix and PROVE it:
 *  - text is emitted as vector <path> (host-font-independent, no tofu),
 *  - every page's QR decodes from the embedded (lossy JPEG) image.
 * Mirrors the real SO-2026-0119 labels from the app preview screenshot.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcDir = resolve(projectRoot, "src");
const jiti = createJiti(import.meta.url, { alias: { "@": srcDir }, interopDefault: true });

const { generateStickerRollPdf } = await jiti.import(resolve(srcDir, "lib/production/generate-sticker-pdf.ts"));
const { buildStickerPageSvg } = await jiti.import(resolve(srcDir, "lib/production/render-sticker-raster.ts"));
const { PRINTER_MATCH_MODE } = await jiti.import(resolve(srcDir, "lib/production/label-printer-settings.ts"));

const base = {
  fabric_line_id: "l",
  client_code: "FR-0726-0039",
  client_name: "Abdelaziz Mohamad Al Rethel",
  garment_type: "Shirt",
  piece_name: "Shirt",
  supplier_name: "Loro Piana",
  cut_unit: "meters",
  labels_sent: 1,
  sticker_total: 37,
  weight_gsm: 150,
};
const rows = [
  { i: 1, code: "FR-0119-L01", brand: "Loro Piana", fab: "722037", qty: 1.5, comp: '100% COTONE "KNIT SHIRT"' },
  { i: 2, code: "FR-0119-L02", brand: "Loro Piana", fab: "722041", qty: 1.5, comp: '100% COTONE "KNIT SHIRT"' },
  { i: 3, code: "FR-0119-L03", brand: "Solbiati", fab: "S23004", qty: 2.5, comp: 'LIGHT TWISTED T.P. 100% LINO' },
];
const entries = rows.map((r) => ({
  role: "prep",
  label: {
    ...base,
    sticker_code: r.code,
    fabric_number: r.fab,
    fabric_brand: r.brand,
    supplier_name: r.brand,
    production_code: r.code,
    fabric_cut_code: r.code,
    qr_payload: r.code,
    composition: r.comp,
    cut_quantity: r.qty,
    article_number: r.i,
    sticker_index: r.i,
  },
}));

// Proof 1: text is vector paths, not <text> (which would tofu without host fonts).
const svg = buildStickerPageSvg(entries[0].label, "prep", PRINTER_MATCH_MODE, 100).svg;
const hasPath = svg.includes("<path");
const hasText = /<text[\s>]/.test(svg);
console.log(`SVG text mode: <path>=${hasPath}  <text>=${hasText}  ->`, hasPath && !hasText ? "VECTOR OK" : "STILL USES <text>!");

// Proof 2: generate the PDF exactly like the fabric-cuts route.
const bytes = await generateStickerRollPdf(entries, { rotationDeg: PRINTER_MATCH_MODE, scalePct: 100 });
const pdfPath = resolve(projectRoot, "pdf-proof-fabric-cuts.pdf");
writeFileSync(pdfPath, Buffer.from(bytes));
console.log("PDF:", pdfPath, `${(bytes.length / 1024).toFixed(0)}KB, ${entries.length} pages`);

// Extract + decode every embedded image.
execFileSync("node", ["scripts/extract-pdf-images.mjs", pdfPath, "/tmp/pdfproof"], { cwd: projectRoot, stdio: "inherit" });
