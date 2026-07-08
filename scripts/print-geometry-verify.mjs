/**
 * Verify the BROWSER-PRINT asset for printer-match after the portrait fix:
 *  - PNG is PORTRAIT (~408×815 at 203 DPI), matching the D550 51×102 media,
 *  - content bbox is horizontally centered (left margin ≈ right margin),
 *  - top margin ≈ bottom margin (vertically centered, no huge empty top),
 *  - nothing clipped at any edge,
 *  - QR still decodes.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createJiti } from "jiti";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcDir = resolve(projectRoot, "src");
const jsQR = require(resolve(__dirname, "vendor/jsQR.js"));
const jiti = createJiti(import.meta.url, { alias: { "@": srcDir }, interopDefault: true });

const { generateStickerRollPngs } = await jiti.import(resolve(srcDir, "lib/production/generate-sticker-pdf.ts"));
const { browserPrintPageLayout } = await jiti.import(resolve(srcDir, "lib/production/sticker-print-html.ts"));
const { PRINTER_MATCH_MODE } = await jiti.import(resolve(srcDir, "lib/production/label-printer-settings.ts"));

const label = {
  fabric_line_id: "l", client_code: "FR-0726-0039", client_name: "Abdelaziz Mohamad Al Rethel",
  garment_type: "Shirt", piece_name: "Shirt", supplier_name: "Loro Piana", fabric_brand: "Loro Piana",
  fabric_number: "722037", cut_unit: "meters", cut_quantity: 1.5, labels_sent: 1, weight_gsm: 150,
  composition: '100% COTONE "KNIT SHIRT"', sticker_code: "FR-0119-L01", production_code: "FR-0119-L01",
  fabric_cut_code: "FR-0119-L01", qr_payload: "FR-0119-L01", article_number: 1, sticker_index: 1, sticker_total: 37,
};

async function bbox(png) {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y += 1)
    for (let x = 0; x < info.width; x += 1)
      if (data[y * info.width + x] < 128) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  return { minX, minY, maxX, maxY, w: info.width, h: info.height };
}

function decode(png) {
  return sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }).then(({ data, info }) => {
    const r = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height);
    return r?.data ?? null;
  });
}

const mmPx = (mm) => Math.round((mm * 203) / 25.4);
const layout = browserPrintPageLayout(PRINTER_MATCH_MODE);
console.log(`browserPrintPageLayout(printer-match) = ${layout.pageW}×${layout.pageH}mm landscape=${layout.landscape}`);

const [png] = await generateStickerRollPngs([{ label, role: "prep" }], {
  rotationDeg: PRINTER_MATCH_MODE, scalePct: 100, browserPrint: true,
});
writeFileSync(resolve(projectRoot, "print-geometry-browserprint.png"), png);

const meta = await sharp(png).metadata();
const bb = await bbox(png);
const payload = await decode(png);

const isPortrait = meta.height > meta.width;
const leftM = bb.minX;
const rightM = meta.width - 1 - bb.maxX;
const topM = bb.minY;
const bottomM = meta.height - 1 - bb.maxY;
const hCentered = Math.abs(leftM - rightM) <= Math.max(6, meta.width * 0.03);
// The QR + text block is geometrically centered; the top ink margin runs ~4-module quiet
// zone larger than the bottom text descent, so allow ~7mm (≈56px @203dpi) asymmetry.
const vCentered = Math.abs(topM - bottomM) <= mmPx(7);
const noClip = leftM >= 1 && rightM >= 1 && topM >= 1 && bottomM >= 1;

const ok = isPortrait && !layout.landscape && hCentered && vCentered && noClip && payload === label.qr_payload;
console.log(
  `asset ${meta.width}x${meta.height} portrait=${isPortrait}  ` +
  `margins L/R=${leftM}/${rightM} T/B=${topM}/${bottomM}  ` +
  `hCentered=${hCentered} vCentered=${vCentered} noClip=${noClip}  decode=${payload}  ${ok ? "OK" : "FAIL"}`
);
process.exit(ok ? 0 : 1);
