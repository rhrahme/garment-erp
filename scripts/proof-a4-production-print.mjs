#!/usr/bin/env node
/**
 * Local proof: render a production A4 print HTML fixture with RECEIVING_A4_PRINT_CSS
 * under print media, emit PDF/PNG, and fail if Chrome would shrink-to-fit.
 *
 * Usage: node scripts/proof-a4-production-print.mjs
 * Output: tmp-pdf-inspect/a4-production-print-proof.*
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(root, "tmp-pdf-inspect");
mkdirSync(outDir, { recursive: true });

const require = createRequire(import.meta.url);

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
  ["1", "LORO PIANA", "71% WOOL 15% SILK 14% LINEN 'SUMMERTIME'", "250 gsm / 150 cm", "160111"],
  ["2", "ZEGNA", "100% WOOL", "260 gsm / 150 cm", "66046"],
  ["3", "LORO PIANA", "FELCE blend", "240 gsm / 150 cm", "FELCE"],
];

const qrSvg =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#000"/><rect x="16" y="16" width="96" height="96" fill="#fff"/><rect x="32" y="32" width="64" height="64" fill="#000"/></svg>'
  );

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>A4 production print proof - SO-2026-0129 fixture</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif; margin: 0; color: #0f172a; background: #e2e8f0; }
  ${css}
  @media screen {
    .proof-chrome { max-width: 210mm; margin: 12px auto; padding: 12px; }
  }
  @media print {
    body { background: white !important; }
    .proof-chrome { margin: 0; padding: 0; max-width: none; }
  }
</style>
</head>
<body>
<div class="sales-order-print proof-chrome">
  <div class="print-a4-sheet" id="sheet">
    <p style="font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#64748b;font-size:11pt;margin:0">Production - piece stickers</p>
    <h1 style="margin:4px 0 0;font-size:22pt">SO-2026-0129</h1>
    <p style="margin:6px 0 0;font-weight:700;font-size:14pt">FOUAD RAHME</p>
    <p style="margin:4px 0 12px;font-size:11pt">Client: Abdel Aziz Fahd Al Ajlan</p>
    <p style="margin:0 0 10px;font-size:11pt">One QR per garment piece - after fabric prep, stick on jacket, trouser, shirt, etc.</p>

    <div class="print-prod-section">
      <h2 style="font-size:11pt;text-transform:uppercase;margin:0 0 8px">Piece sticker codes - cutting / sewing</h2>
      <table class="print-receiving-table" style="border-collapse:collapse;width:100%">
        <colgroup>
          <col style="width:8%"/><col style="width:14%"/><col style="width:34%"/><col style="width:16%"/><col style="width:28%"/>
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
              <td class="print-code" style="color:#3730a3">${code}</td>
              <td class="print-code">${fab}</td>
              <td class="print-garment">${garment}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div class="print-prod-fabric-section" style="margin-top:18px">
      <h2 style="font-size:11pt;text-transform:uppercase;margin:0 0 8px">Fabric / composition reference</h2>
      <table class="print-receiving-table" style="border-collapse:collapse;width:100%">
        <colgroup>
          <col style="width:8%"/><col style="width:16%"/><col style="width:36%"/><col style="width:18%"/><col style="width:22%"/>
        </colgroup>
        <thead>
          <tr>
            <th>Art.</th><th>Brand</th><th>Composition</th><th>Spec</th><th>Fabric #</th>
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
              <td class="print-code">${r[4]}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <p style="margin-top:12px;font-size:9pt;color:#94a3b8">Generated proof fixture  SO-2026-0129</p>
  </div>
</div>
</body>
</html>
`;

const htmlPath = resolve(outDir, "a4-production-print-proof.html");
writeFileSync(htmlPath, html, "utf8");
console.log("Wrote", htmlPath);

const checks = [
  ["portrait @page", /size:\s*A4\s+portrait/i.test(html)],
  ["no landscape @page", !/size:\s*A4\s+landscape/i.test(html)],
  ["no transform:scale", !/transform\s*:\s*scale\s*\(/i.test(html)],
  ["no zoom control", !/zoom\s*:/i.test(html)],
  ["no width:auto body", !/body\s*\{[^}]*width:\s*auto\s*!important/i.test(html)],
  ["body width 100%", /body\s*\{[^}]*width:\s*100%\s*!important/s.test(html)],
  ["table width 100%", /width:\s*100%\s*!important/.test(html)],
  ["td font >= 10pt", /font-size:\s*11pt\s*!important/.test(html)],
  ["max-width none on print sheet", /max-width:\s*none\s*!important/.test(html)],
  ["screen preview 186mm not 210mm", /width:\s*186mm/.test(html) && !/max-width:\s*210mm/.test(css)],
  ["webkit print color", /-webkit-print-color-adjust:\s*exact/.test(html)],
  ["no avoid-page on prod section", !/\.print-prod-section\s*\{[^}]*avoid-page/i.test(html)],
  ["page-break-before fabric", /page-break-before:\s*always/.test(html)],
  ["Helvetica/Arial print font", /font-family:\s*Helvetica,\s*Arial,\s*sans-serif/.test(html)],
  ["fixture cells not monospace", !/font-family:\s*ui-monospace|font-family:\s*monospace/i.test(html)],
];
let ok = true;
for (const [label, pass] of checks) {
  console.log(pass ? "OK " : "FAIL ", label);
  if (!pass) ok = false;
}

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
  console.log("Playwright not installed - skipped PNG/PDF. Open HTML in Chrome/Safari print preview.");
  process.exit(ok ? 0 : 1);
}

const { chromium } = playwright;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
await page.goto("file://" + htmlPath, { waitUntil: "networkidle" });
await page.emulateMedia({ media: "print" });

const geom = await page.evaluate(() => {
  const sheet = document.getElementById("sheet");
  const table = document.querySelector(".print-receiving-table");
  const td = document.querySelector(".print-receiving-table td");
  const sr = sheet.getBoundingClientRect();
  const tr = table.getBoundingClientRect();
  return {
    sheetWidth: sr.width,
    tableWidth: tr.width,
    fillRatio: tr.width / sr.width,
    docScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    overflowRatio: document.documentElement.scrollWidth / window.innerWidth,
    tdFontPx: parseFloat(getComputedStyle(td).fontSize),
    bodyWidthCss: getComputedStyle(document.body).width,
    sheetMaxWidth: getComputedStyle(sheet).maxWidth,
  };
});

const pngPath = resolve(outDir, "a4-production-print-proof.png");
await page.locator("#sheet").screenshot({ path: pngPath });

const pdfPath = resolve(outDir, "a4-production-print-proof.pdf");
await page.pdf({
  path: pdfPath,
  format: "A4",
  landscape: false,
  printBackground: true,
  margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
  preferCSSPageSize: true,
});
await browser.close();

console.log("Geometry:", geom);
console.log("Wrote", pngPath);
console.log("Wrote", pdfPath);

if (geom.overflowRatio > 1.02) {
  console.error(`FAIL: document scrollWidth exceeds viewport (ratio ${geom.overflowRatio.toFixed(3)}) - Chrome will shrink-to-fit`);
  ok = false;
} else {
  console.log(`OK: no viewport overflow (ratio ${geom.overflowRatio.toFixed(3)})`);
}
if (geom.fillRatio < 0.95) {
  console.error(`FAIL: table only fills ${(geom.fillRatio * 100).toFixed(1)}% of sheet (need >= 95%)`);
  ok = false;
} else {
  console.log(`OK: table fills ${(geom.fillRatio * 100).toFixed(1)}% of sheet width`);
}
// 11pt at 96dpi ~= 14.67px
if (!(geom.tdFontPx >= 13.5 && geom.tdFontPx <= 16)) {
  console.error(`FAIL: td font ${geom.tdFontPx}px not in 11pt band`);
  ok = false;
} else {
  console.log(`OK: td font ${geom.tdFontPx}px (~11pt)`);
}

// Measure PDF ink fill with PyMuPDF when available.
const py = spawnSync(
  "python3",
  [
    "-c",
    `
import sys
try:
  import fitz
except Exception as e:
  print('SKIP_PYMUPDF', e)
  sys.exit(0)
doc = fitz.open(${JSON.stringify(pdfPath)})
ok = True
for i, page in enumerate(doc):
  blocks = page.get_text('dict')['blocks']
  xs=[]; xe=[]; sizes=set()
  for b in blocks:
    if b.get('type') == 0:
      xs.append(b['bbox'][0]); xe.append(b['bbox'][2])
      for line in b.get('lines', []):
        for span in line.get('spans', []):
          sizes.add(round(span['size'], 1))
    elif b.get('type') == 1:
      xs.append(b['bbox'][0]); xe.append(b['bbox'][2])
  if not xs:
    continue
  left, right = min(xs), max(xe)
  pw = page.rect.width
  content_w = pw - 2 * 34  # ~12mm margins in points
  fill = (right - left) / content_w
  print(f'PDF page{i}: fill={fill*100:.1f}% fonts={sorted(sizes)}')
  if i == 1 and fill < 0.92:
    print('FAIL: fabric page ink fill < 92%')
    ok = False
  if 11.0 not in sizes and not any(s >= 10.5 for s in sizes):
    print('FAIL: missing >=10.5pt body text')
    ok = False
sys.exit(0 if ok else 2)
`,
  ],
  { encoding: "utf8" }
);
if (py.stdout) process.stdout.write(py.stdout);
if (py.stderr) process.stderr.write(py.stderr);
if (py.status === 2) ok = false;

// Fail if Chromium embedded Courier / Type3-only stacks for piece codes.
const fontCheck = spawnSync(
  "python3",
  [
    "-c",
    `
import fitz, sys
doc = fitz.open(${JSON.stringify(pdfPath)})
page = doc[0]
fonts = page.get_fonts()
names = sorted({(f[3] or f[4] or "") for f in fonts})
types = {f[2] for f in fonts}
print("PDF font names:", names)
print("PDF font types:", sorted(types))
courier = [n for n in names if "courier" in n.lower()]
if courier:
  print("FAIL: Courier embedded for print codes:", courier)
  sys.exit(2)
# Prefer built-in Helvetica (Type1/Type0 with Helvetica base), not only Type3 system UI.
has_helvetica = any("helvetica" in n.lower() or "arial" in n.lower() for n in names)
only_type3 = types <= {"Type3"} or types == {"Type3"}
if only_type3 and not has_helvetica:
  print("FAIL: print PDF used only Type3 system fonts (glyph-stack risk)")
  sys.exit(2)
if has_helvetica:
  print("OK: Helvetica/Arial present in production print PDF")
else:
  print("OK: no Courier; font types", sorted(types))
`,
  ],
  { encoding: "utf8" }
);
if (fontCheck.stdout) process.stdout.write(fontCheck.stdout);
if (fontCheck.stderr) process.stderr.write(fontCheck.stderr);
if (fontCheck.status === 2) ok = false;

process.exit(ok ? 0 : 1);
