/**
 * Render the rotation-calibration PDF (generateCalibrationStickerPdf) and
 * rasterise EACH of the 4 pages (A/B/C/D) to PNG so the pre-rotations can be
 * eyeballed. sips only rasterises page 1, so we emit one single-page PDF per
 * letter via the generator's `letters` filter.
 *
 * Usage: node scripts/render-calibration.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
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

const { generateCalibrationStickerPdf, CALIBRATION_PAGES } = await jiti.import(
  resolve(srcDir, "lib/production/generate-sticker-pdf.ts")
);

// --- Full 4-page PDF — proves page count + MediaBox ---
const bytes = await generateCalibrationStickerPdf();
const buf = Buffer.from(bytes);
const pdfPath = resolve(projectRoot, "sticker-calibration.pdf");
writeFileSync(pdfPath, buf);

const pdfText = buf.toString("latin1");
const mediaBoxes = [...pdfText.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map((m) => m[1]);
const pageCount = (pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const MM_PER_PT = 25.4 / 72;
const mediaBoxMm = mediaBoxes.map((b) =>
  b
    .trim()
    .split(/\s+/)
    .map((n) => (Number(n) * MM_PER_PT).toFixed(2))
    .join(" ")
);
console.log("PDF:", pdfPath);
console.log("Pages:", pageCount);
console.log("Mapping:", CALIBRATION_PAGES.map((p) => `${p.letter}=${p.rotationDeg}`).join("  "));
console.log("MediaBox per page (mm):", mediaBoxMm.join(" | "));

// --- Per-letter single-page PDFs so sips can rasterise each page ---
const pngPaths = [];
for (const page of CALIBRATION_PAGES) {
  const oneBytes = await generateCalibrationStickerPdf({ letters: [page.letter] });
  const onePdf = resolve(projectRoot, `sticker-calibration-${page.letter}.pdf`);
  writeFileSync(onePdf, Buffer.from(oneBytes));
  const png = resolve(projectRoot, `sticker-calibration-${page.letter}.png`);
  execFileSync(
    "sips",
    ["-s", "format", "png", "-s", "dpiHeight", "300", "-s", "dpiWidth", "300", onePdf, "--out", png],
    { stdio: "ignore" }
  );
  if (existsSync(png)) pngPaths.push(png);
}

console.log("PNGs (one per calibration letter):\n      " + pngPaths.join("\n      "));
