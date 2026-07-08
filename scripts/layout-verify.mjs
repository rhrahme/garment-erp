/**
 * Verify the sticker label layout FITS the 51×102 mm portrait media at 203 DPI:
 *  - rendered PNG is ~408×814 px,
 *  - all text lines are present (path count) and content bbox is within margins (no clip),
 *  - QR decodes,
 *  - holds even at scale 150% (auto-fit must cap it so nothing overflows).
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
const { buildStickerPageSvg } = await jiti.import(resolve(srcDir, "lib/production/render-sticker-raster.ts"));
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

let allOk = true;
for (const scalePct of [100, 150]) {
  const svg = buildStickerPageSvg(label, "prep", PRINTER_MATCH_MODE, scalePct).svg;
  const pathCount = (svg.match(/<path/g) ?? []).length; // header + 8 lines = 9 expected
  const [png] = await generateStickerRollPngs([{ label, role: "prep" }], { rotationDeg: PRINTER_MATCH_MODE, scalePct, browserPrint: false });
  const meta = await sharp(png).metadata();
  const bb = await bbox(png);
  const payload = await decode(png);
  const withinBounds = bb.minY >= 1 && bb.maxY <= meta.height - 1 && bb.minX >= 1 && bb.maxX <= meta.width - 1;
  const topMarginPx = bb.minY;
  const bottomMarginPx = meta.height - 1 - bb.maxY;
  if (scalePct === 100) writeFileSync(resolve(projectRoot, "layout-verify-portrait.png"), png);
  const ok = pathCount >= 9 && withinBounds && payload === label.qr_payload && bottomMarginPx > 2;
  allOk = allOk && ok;
  console.log(
    `scale=${scalePct}%  ${meta.width}x${meta.height}  textPaths=${pathCount}  ` +
    `bbox=[y ${bb.minY}..${bb.maxY} / x ${bb.minX}..${bb.maxX}]  ` +
    `margins(top/bottom px)=${topMarginPx}/${bottomMarginPx}  decode=${payload}  ${ok ? "OK" : "FAIL"}`
  );
}
process.exit(allOk ? 0 : 1);
