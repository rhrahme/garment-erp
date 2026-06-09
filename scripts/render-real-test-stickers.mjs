/**
 * Render the REAL sticker test PDF (generateTestStickerPdf, S10008 + S10009) and
 * rasterise each page to PNG so the portrait-upright layout can be inspected.
 *
 * Uses jiti to load the actual TypeScript generator (with `@/` path aliases) so
 * we verify the exact production code path, not a re-implementation.
 *
 * Usage: node scripts/render-real-test-stickers.mjs [rotation]
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

const rotation = Number(process.argv[2] ?? "0");

const { generateTestStickerPdf, generateStickerRollPdf } = await jiti.import(
  resolve(srcDir, "lib/production/generate-sticker-pdf.ts")
);

// --- Full real test PDF (both pages) — proves page count + MediaBox ---
const bytes = await generateTestStickerPdf({ rotationDeg: rotation, scalePct: 100 });
const buf = Buffer.from(bytes);
const pdfPath = resolve(projectRoot, `sticker-test-real-${rotation}.pdf`);
writeFileSync(pdfPath, buf);

const pdfText = buf.toString("latin1");
const mediaBoxes = [...pdfText.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map((m) => m[1]);
const pageCount = (pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
console.log("PDF:", pdfPath);
console.log("Pages:", pageCount);
console.log("MediaBox per page (pt):", mediaBoxes.join(" | "));

// --- Per-page single-label PDFs so `sips` (page-1-only) can rasterise each ---
const baseLabel = {
  fabric_line_id: "test-line",
  production_code: "L01-SHT",
  fabric_cut_code: "L01-SHT",
  qr_payload: "L01-SHT",
  client_code: "FR-0128-0019",
  client_name: "Ralph Rahme",
  garment_type: "Shirt",
  piece_name: "Shirt",
  supplier_name: "Solbiati",
  fabric_brand: "Solbiati",
  composition: "100% COTTON TEST",
  weight_gsm: 240,
  cut_quantity: 0.9,
  cut_unit: "meters",
  labels_sent: 1,
  article_number: 1,
  sticker_total: 2,
};
const pages = [
  { ...baseLabel, sticker_code: "TEST-S10008", fabric_number: "S10008", sticker_index: 1 },
  { ...baseLabel, sticker_code: "TEST-S10009", fabric_number: "S10009", sticker_index: 2 },
];

const pngPaths = [];
for (let i = 0; i < pages.length; i += 1) {
  const oneBytes = await generateStickerRollPdf([{ label: pages[i], role: "prep" }], {
    rotationDeg: rotation,
    scalePct: 100,
  });
  const onePdf = resolve(projectRoot, `sticker-test-real-${rotation}-page${i + 1}.pdf`);
  writeFileSync(onePdf, Buffer.from(oneBytes));
  const png = resolve(projectRoot, `sticker-test-real-${rotation}-page${i + 1}.png`);
  execFileSync("sips", ["-s", "format", "png", "-s", "dpiHeight", "300", "-s", "dpiWidth", "300", onePdf, "--out", png], {
    stdio: "ignore",
  });
  if (existsSync(png)) pngPaths.push(png);
}

console.log("PNGs:\n      " + pngPaths.join("\n      "));
