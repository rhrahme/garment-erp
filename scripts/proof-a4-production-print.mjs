#!/usr/bin/env node
/**
 * Local proof: render a production A4 print HTML fixture with RECEIVING_A4_PRINT_CSS
 * and measure content width vs page width (must fill nearly full landscape A4).
 *
 * Usage: node scripts/proof-a4-production-print.mjs
 * Output: tmp-pdf-inspect/a4-production-print-proof.html (+ .png if playwright available)
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(root, "tmp-pdf-inspect");
mkdirSync(outDir, { recursive: true });

const require = createRequire(import.meta.url);

// Load CSS via a tiny TS strip: read the export string literally from source.
const stylesSrc = readFileSync(resolve(root, "src/lib/sales-orders/receiving-print-styles.ts"), "utf8");
const cssMatch = stylesSrc.match(/export const RECEIVING_A4_PRINT_CSS = `([\s\S]*?)`;/);
if (!cssMatch) {
  console.error("Could not extract RECEIVING_A4_PRINT_CSS");
  process.exit(1);
}
const css = cssMatch[1];

const rows = [
  ["1", "FR-0129-L01-JK-1/2", "160111", "Jacket / Suit"],
  ["1", "FR-0129-L01-TR-2/2", "160111", "Trouser / Suit"],
  ["2", "FR-0129-L02-TR", "66046", "Trouser"],
  ["3", "FR-0129-L08-TR-1/2", "FELCE", "Trouser / Suit"],
  ["3", "FR-0129-L08-JK-2/2", "FELCE", "Jacket / Suit"],
];

const fabricRows = [
  [
    "1",
    "LORO PIANA",
    "71% WOOL 15% SILK 14% LINEN 'SUMMERTIME'",
    "250 gsm",
    "150 cm",
    "Jacket / Suit",
    "FR-0129-L01-JK-1/2",
    "160111",
  ],
  [
    "1",
    "LORO PIANA",
    "71% WOOL 15% SILK 14% LINEN 'SUMMERTIME'",
    "250 gsm",
    "150 cm",
    "Trouser / Suit",
    "FR-0129-L01-TR-2/2",
    "160111",
  ],
  ["2", "ZEGNA", "100% WOOL", "260 gsm", "150 cm", "Trouser", "FR-0129-L02-TR", "66046"],
];

const qrSvg =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#000"/><rect x="16" y="16" width="96" height="96" fill="#fff"/><rect x="32" y="32" width="64" height="64" fill="#000"/></svg>`
  );

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>A4 production print proof — SO-2026-0129 fixture</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; color: #0f172a; }
  ${css}
  /* Screen preview mimics print box */
  .proof-frame {
    width: 297mm;
    min-height: 210mm;
    margin: 12px auto;
    padding: 6mm;
    box-sizing: border-box;
    border: 1px dashed #94a3b8;
    background: white;
  }
  @media print {
    .proof-frame { border: none; margin: 0; padding: 0; width: 100%; }
  }
</style>
</head>
<body>
<div class="sales-order-print">
  <div class="print-a4-sheet proof-frame" id="sheet">
    <p style="font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#64748b;font-size:11pt;margin:0">Production — piece stickers</p>
    <h1 style="margin:4px 0 0;font-size:22pt">SO-2026-0129</h1>
    <p style="margin:6px 0 0;font-weight:700;font-size:14pt">FOUAD RAHME</p>
    <p style="margin:4px 0 12px;font-size:11pt">Client: Abdel Aziz Fahd Al Ajlan</p>
    <p style="margin:0 0 10px;font-size:11pt">One QR per garment piece — after fabric prep, stick on jacket, trouser, shirt, etc.</p>

    <h2 style="font-size:11pt;text-transform:uppercase;margin:0 0 8px">Piece sticker codes — cutting / sewing</h2>
    <table class="print-receiving-table" style="border-collapse:collapse;width:100%">
      <colgroup>
        <col style="width:6%"/><col style="width:12%"/><col style="width:36%"/><col style="width:16%"/><col style="width:30%"/>
      </colgroup>
      <thead>
        <tr>
          <th>Art.</th><th>QR</th><th>Piece code</th><th>Fabric #</th><th>Garment</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            ([art, code, fab, garment]) => `
          <tr>
            <td style="text-align:center;font-weight:700">${art}</td>
            <td><img src="${qrSvg}" alt=""/></td>
            <td style="font-family:ui-monospace,monospace;color:#3730a3">${code}</td>
            <td style="font-family:ui-monospace,monospace">${fab}</td>
            <td class="print-garment">${garment}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>

    <div class="print-prod-fabric-section" style="margin-top:18px">
      <h2 style="font-size:11pt;text-transform:uppercase;margin:0 0 8px">Fabric / composition reference</h2>
      <table class="print-receiving-table" style="border-collapse:collapse;width:100%">
        <colgroup>
          <col style="width:5%"/><col style="width:12%"/><col style="width:28%"/><col style="width:8%"/>
          <col style="width:8%"/><col style="width:14%"/><col style="width:15%"/><col style="width:10%"/>
        </colgroup>
        <thead>
          <tr>
            <th>Art.</th><th>Brand</th><th>Composition</th><th>Weight</th>
            <th>Width</th><th>Garment</th><th>Piece code</th><th>Fabric #</th>
          </tr>
        </thead>
        <tbody>
          ${fabricRows
            .map(
              (r) => `
            <tr>
              <td style="text-align:center;font-weight:700">${r[0]}</td>
              <td>${r[1]}</td>
              <td class="print-composition">${r[2]}</td>
              <td>${r[3]}</td>
              <td>${r[4]}</td>
              <td class="print-garment">${r[5]}</td>
              <td style="font-family:ui-monospace,monospace;color:#3730a3">${r[6]}</td>
              <td style="font-family:ui-monospace,monospace">${r[7]}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <p style="margin-top:12px;font-size:9pt;color:#94a3b8">Generated proof fixture · SO-2026-0129</p>
  </div>
</div>
<script>
  // Expose geometry for headless measurement
  window.__proofGeometry = () => {
    const sheet = document.getElementById('sheet');
    const table = document.querySelector('.print-receiving-table');
    const sr = sheet.getBoundingClientRect();
    const tr = table.getBoundingClientRect();
    return {
      sheetWidth: sr.width,
      tableWidth: tr.width,
      fillRatio: tr.width / sr.width,
    };
  };
</script>
</body>
</html>
`;

const htmlPath = resolve(outDir, "a4-production-print-proof.html");
writeFileSync(htmlPath, html, "utf8");
console.log("Wrote", htmlPath);

// Geometry check in screen preview frame (297mm wide).
let playwright;
try {
  playwright = require("playwright");
} catch {
  try {
    playwright = require("@playwright/test");
  } catch {
    playwright = null;
  }
}

if (!playwright?.chromium) {
  // Fallback: assert CSS invariants from the written HTML (no browser).
  const checks = [
    ["no transform:scale", !/transform\s*:\s*scale\s*\(/i.test(html)],
    ["zoom:1 present", /zoom:\s*1\s*!important/i.test(html)],
    ["table width 100%", /width:\s*100%\s*!important/.test(html)],
    ["td font >= 10pt", /font-size:\s*11pt\s*!important/.test(html)],
    ["max-width none on sheet", /max-width:\s*none\s*!important/.test(html)],
  ];
  let ok = true;
  for (const [label, pass] of checks) {
    console.log(pass ? "OK " : "FAIL ", label);
    if (!pass) ok = false;
  }
  console.log("Playwright not installed — skipped PNG/fillRatio. Open HTML in browser print preview.");
  process.exit(ok ? 0 : 1);
}

const { chromium } = playwright;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file://" + htmlPath, { waitUntil: "networkidle" });
const geom = await page.evaluate(() => window.__proofGeometry());
const pngPath = resolve(outDir, "a4-production-print-proof.png");
await page.locator("#sheet").screenshot({ path: pngPath });
await browser.close();

console.log("Geometry:", geom);
console.log("Wrote", pngPath);
if (geom.fillRatio < 0.92) {
  console.error(`FAIL: table only fills ${(geom.fillRatio * 100).toFixed(1)}% of sheet (need >= 92%)`);
  process.exit(1);
}
console.log(`OK: table fills ${(geom.fillRatio * 100).toFixed(1)}% of sheet width`);
