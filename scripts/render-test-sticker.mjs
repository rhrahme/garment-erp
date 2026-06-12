/**
 * Generate test sticker PDF + raw PNG proof (printer-match raster path).
 * Verifies 51×102 mm MediaBox, DCTDecode JPEG embed, and solid bilevel QR.
 * Usage: node scripts/render-test-sticker.mjs [rotation] [scale]
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createJiti } from "jiti";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcDir = resolve(projectRoot, "src");

const jiti = createJiti(import.meta.url, {
  alias: { "@": srcDir },
  interopDefault: true,
});

const rotation = process.argv[2] ?? "printer-match";
const scale = Number.parseInt(process.argv[3] ?? "100", 10);

const { generateTestStickerPdf, generateTestStickerPngs } = await jiti.import(
  resolve(srcDir, "lib/production/generate-sticker-pdf.ts")
);
const { labelPdfPageSizeMm } = await jiti.import(
  resolve(srcDir, "lib/production/label-printer-settings.ts")
);

const pageSize = labelPdfPageSizeMm(rotation);
const MM_TO_PT = 72 / 25.4;
const expectedWPt = (pageSize.width * MM_TO_PT).toFixed(2);
const expectedHPt = (pageSize.height * MM_TO_PT).toFixed(2);

const pdfPath = path.join(projectRoot, "sticker-test-verify.pdf");
const pdfBytes = await generateTestStickerPdf({ rotationDeg: rotation, scalePct: scale });
fs.writeFileSync(pdfPath, Buffer.from(pdfBytes));
console.log(`Wrote ${pdfPath} (${pdfBytes.length} bytes) rotation=${rotation} scale=${scale}`);

const pdfText = Buffer.from(pdfBytes).toString("latin1");

function assertPdf(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`OK: ${message}`);
  return true;
}

assertPdf(pdfText.includes("DCTDecode"), "PDF embeds DCTDecode JPEG (not Indexed 1-bit PNG)");
assertPdf(!pdfText.includes("/SMask"), "PDF has no /SMask alpha soft mask");
assertPdf(!pdfText.includes("/Indexed"), "PDF has no Indexed colour space");

const mediaBoxMatch = pdfText.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
if (mediaBoxMatch) {
  const w = (Number.parseFloat(mediaBoxMatch[3]) - Number.parseFloat(mediaBoxMatch[1])).toFixed(2);
  const h = (Number.parseFloat(mediaBoxMatch[4]) - Number.parseFloat(mediaBoxMatch[2])).toFixed(2);
  assertPdf(
    Math.abs(Number.parseFloat(w) - Number.parseFloat(expectedWPt)) < 0.5 &&
      Math.abs(Number.parseFloat(h) - Number.parseFloat(expectedHPt)) < 0.5,
    `MediaBox ≈ ${pageSize.width}×${pageSize.height} mm (${w}×${h} pt, expected ${expectedWPt}×${expectedHPt} pt)`
  );
} else {
  assertPdf(false, "MediaBox found in PDF");
}

const pngs = await generateTestStickerPngs({ rotationDeg: rotation, scalePct: scale });
for (const [index, png] of pngs.entries()) {
  const pngPath = path.join(projectRoot, `sticker-test-verify-page${index + 1}.png`);
  fs.writeFileSync(pngPath, png);
  console.log(`Wrote ${pngPath} (${png.length} bytes)`);

  const meta = await sharp(png).metadata();
  const expectedWPx = Math.round((pageSize.width * 300) / 25.4);
  const expectedHPx = Math.round((pageSize.height * 300) / 25.4);
  assertPdf(meta.width === expectedWPx && meta.height === expectedHPx, `PNG page ${index + 1} is ${meta.width}×${meta.height}px (expected ${expectedWPx}×${expectedHPx})`);

  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const uniqueGreys = new Set();
  for (let i = 0; i < data.length; i += info.channels) {
    uniqueGreys.add(data[i]);
  }
  assertPdf(uniqueGreys.size <= 2, `PNG page ${index + 1} is bilevel (${uniqueGreys.size} grey levels)`);
  assertPdf(uniqueGreys.has(0) && uniqueGreys.has(255), `PNG page ${index + 1} has black and white pixels`);
}

try {
  const ppmPrefix = path.join(projectRoot, "sticker-test-verify-pdftoppm");
  execSync(`pdftoppm -png -r 300 "${pdfPath}" "${ppmPrefix}"`, { stdio: "inherit" });
  console.log(`pdftoppm proof: ${ppmPrefix}-1.png (and -2.png if multi-page)`);
} catch {
  console.warn("pdftoppm not available — raw PNG proofs above are sufficient.");
}

if (process.exitCode) {
  console.error("\nVerification failed.");
  process.exit(process.exitCode);
}
console.log("\nAll sticker print checks passed.");
