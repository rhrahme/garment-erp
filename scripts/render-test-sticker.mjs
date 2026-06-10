/**
 * Generate test sticker PDF + raw PNG proof (printer-match raster path).
 * Usage: node scripts/render-test-sticker.mjs [rotation] [scale]
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createJiti } from "jiti";

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

const pdfPath = path.join(projectRoot, "sticker-test-verify.pdf");
const pdfBytes = await generateTestStickerPdf({ rotationDeg: rotation, scalePct: scale });
fs.writeFileSync(pdfPath, Buffer.from(pdfBytes));
console.log(`Wrote ${pdfPath} (${pdfBytes.length} bytes) rotation=${rotation} scale=${scale}`);

const pngs = await generateTestStickerPngs({ rotationDeg: rotation, scalePct: scale });
pngs.forEach((png, index) => {
  const pngPath = path.join(projectRoot, `sticker-test-verify-page${index + 1}.png`);
  fs.writeFileSync(pngPath, png);
  console.log(`Wrote ${pngPath} (${png.length} bytes)`);
});

try {
  const ppmPrefix = path.join(projectRoot, "sticker-test-verify-pdftoppm");
  execSync(`pdftoppm -png -r 300 "${pdfPath}" "${ppmPrefix}"`, { stdio: "inherit" });
  console.log(`pdftoppm proof: ${ppmPrefix}-1.png (and -2.png if multi-page)`);
} catch {
  console.warn("pdftoppm not available — raw PNG proofs above are sufficient.");
}
