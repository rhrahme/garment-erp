/**
 * QR sticker print PROOF harness.
 *
 * Generates the EXACT PNG the D550 popup prints (printer-match, browserPrint) for
 * the test label (payload "L01-SHT"), then:
 *   1. saves the raw printed PNG,
 *   2. simulates the physical D550 output (resample 300→203 DPI dot grid + thermal
 *      threshold) — this is what actually lands on the label,
 * and writes both so decode-qr.py can prove scannability.
 *
 * Usage: node scripts/qr-proof.mjs [tag]
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createJiti } from "jiti";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcDir = resolve(projectRoot, "src");
const tag = process.argv[2] ?? "current";

const jiti = createJiti(import.meta.url, { alias: { "@": srcDir }, interopDefault: true });

const { generateStickerRollPngs } = await jiti.import(
  resolve(srcDir, "lib/production/generate-sticker-pdf.ts")
);
const { PRINTER_MATCH_MODE } = await jiti.import(
  resolve(srcDir, "lib/production/label-printer-settings.ts")
);

const EXPECTED = "L01-SHT";
const label = {
  fabric_line_id: "test-line",
  production_code: EXPECTED,
  fabric_cut_code: EXPECTED,
  qr_payload: EXPECTED,
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
  sticker_code: "TEST-S10008",
  fabric_number: "S10008",
  sticker_index: 1,
};

// EXACT bytes the popup prints: printer-match + browserPrint (server pre-rotated landscape).
const [printed] = await generateStickerRollPngs([{ label, role: "prep" }], {
  rotationDeg: PRINTER_MATCH_MODE,
  browserPrint: true,
});

const rawPath = resolve(projectRoot, `qr-proof-${tag}-printed.png`);
writeFileSync(rawPath, printed);

const meta = await sharp(printed).metadata();

// The raster is now rendered at the D550 native 203 DPI, so the printer maps pixels ~1:1
// (no resampling). Simulate the physical thermal print: dot gain (slight blur) + the head's
// on/off threshold, at 1:1 — plus a phone-camera-ish soft capture — then decode.
const simGray = await sharp(printed).greyscale().blur(0.7).png().toBuffer();
const simPath = resolve(projectRoot, `qr-proof-${tag}-printsim-gray.png`);
writeFileSync(simPath, simGray);

const simBw = await sharp(simGray).threshold(128).png().toBuffer();
const simBwPath = resolve(projectRoot, `qr-proof-${tag}-printsim-bw.png`);
writeFileSync(simBwPath, simBw);

console.log("Expected payload:", EXPECTED);
console.log("Printed PNG:", rawPath, `${meta.width}x${meta.height}`);
console.log("Print-sim (thermal gray):", simPath);
console.log("Print-sim (thermal b/w): ", simBwPath);
