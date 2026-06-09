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

// Mode may be "printer-match" (default) or a numeric rotation (0/90/180/270).
const rawMode = process.argv[2] ?? "printer-match";
const rotation = rawMode === "printer-match" ? "printer-match" : Number(rawMode);
const isPrinterMatch = rotation === "printer-match";
const tag = String(rotation);

const { generateTestStickerPdf, generateStickerRollPdf } = await jiti.import(
  resolve(srcDir, "lib/production/generate-sticker-pdf.ts")
);

// --- Full real test PDF (both pages) — proves page count + MediaBox ---
const bytes = await generateTestStickerPdf({ rotationDeg: rotation, scalePct: 100 });
const buf = Buffer.from(bytes);
const pdfPath = resolve(projectRoot, `sticker-test-real-${tag}.pdf`);
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
console.log("Mode:", tag);
console.log("PDF:", pdfPath);
console.log("Pages:", pageCount);
console.log("MediaBox per page (pt):", mediaBoxes.join(" | "));
console.log("MediaBox per page (mm):", mediaBoxMm.join(" | "));

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
const simPaths = [];
for (let i = 0; i < pages.length; i += 1) {
  const oneBytes = await generateStickerRollPdf([{ label: pages[i], role: "prep" }], {
    rotationDeg: rotation,
    scalePct: 100,
  });
  const onePdf = resolve(projectRoot, `sticker-test-real-${tag}-page${i + 1}.pdf`);
  writeFileSync(onePdf, Buffer.from(oneBytes));
  const png = resolve(projectRoot, `sticker-test-real-${tag}-page${i + 1}.png`);
  execFileSync("sips", ["-s", "format", "png", "-s", "dpiHeight", "300", "-s", "dpiWidth", "300", onePdf, "--out", png], {
    stdio: "ignore",
  });
  if (existsSync(png)) pngPaths.push(png);

  // Printer SIMULATION: the D550 rasterises with a fixed ~90° CCW turn under
  // "Fit to paper". CCW 90° == sips clockwise 270°. The simulated PNG is what
  // physically comes off the printer; for "Match my printer" it MUST read
  // horizontally (QR left, text right) on a landscape page.
  if (isPrinterMatch && existsSync(png)) {
    const sim = resolve(projectRoot, `sticker-test-real-${tag}-page${i + 1}-printsim.png`);
    execFileSync("cp", [png, sim]);
    execFileSync("sips", ["--rotate", "270", sim], { stdio: "ignore" });
    if (existsSync(sim)) simPaths.push(sim);
  }
}

console.log("PNGs (raw, as the PDF page looks on screen):\n      " + pngPaths.join("\n      "));
if (simPaths.length > 0) {
  console.log(
    "PNGs (printer-simulated, rotated 90° CCW = physical output):\n      " + simPaths.join("\n      ")
  );
}
