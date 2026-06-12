/**
 * Generate one SO-2026-0102 prep sticker PDF + PNG proof (printer-match mode).
 * Usage: node scripts/render-so-0102-sticker.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcDir = resolve(projectRoot, "src");

const jiti = createJiti(import.meta.url, {
  alias: { "@": srcDir },
  interopDefault: true,
});

const { loadStickerPdfEntries } = await jiti.import(resolve(srcDir, "lib/production/sticker-sheet-data.ts"));
const { generateStickerRollPdf } = await jiti.import(resolve(srcDir, "lib/production/generate-sticker-pdf.ts"));

const orderId = "so-1780164354118";
const loaded = await loadStickerPdfEntries(orderId, { sheet: "fabric-cuts" });
if (!loaded) {
  console.error("Order not found:", orderId);
  process.exit(1);
}

const entry = loaded.entries[0];
console.log("SO:", loaded.order.so_number);
console.log("Sticker:", entry.label.sticker_code, entry.label.fabric_number);

const bytes = await generateStickerRollPdf([entry], { rotationDeg: "printer-match", scalePct: 100 });
const pdfPath = resolve(projectRoot, "sticker-test-so-0102.pdf");
writeFileSync(pdfPath, Buffer.from(bytes));

if (bytes.length < 65_000) {
  console.error(`FAIL: PDF too small (${bytes.length} bytes) — likely gray/low-quality JPEG embed`);
  process.exit(1);
}
console.log(`OK: PDF ${bytes.length} bytes`);

const pngPath = resolve(projectRoot, "sticker-test-so-0102.png");
execFileSync("sips", ["-s", "format", "png", "-s", "dpiHeight", "300", "-s", "dpiWidth", "300", pdfPath, "--out", pngPath], {
  stdio: "ignore",
});

const simPath = resolve(projectRoot, "sticker-test-so-0102-printsim.png");
if (existsSync(pngPath)) {
  execFileSync("cp", [pngPath, simPath]);
  execFileSync("sips", ["--rotate", "270", simPath], { stdio: "ignore" });
}

console.log("PDF:", pdfPath);
console.log("PNG:", pngPath);
if (existsSync(simPath)) console.log("Printsim:", simPath);
