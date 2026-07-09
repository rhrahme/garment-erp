/**
 * Diagnose the sticker print-generation path against the SO-2026-0119 preview.
 * Renders the CURRENT artifact (printer-match) + a print simulation so we can
 * eyeball what actually reaches the D550.
 * Usage: node scripts/sticker-diagnose.mjs
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
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

const { renderStickerPagePng } = await jiti.import(
  resolve(srcDir, "lib/production/render-sticker-raster.ts")
);

// Matches SO-2026-0119 label 1/37 from the preview screenshot.
const label = {
  sticker_code: "0119-L01",
  fabric_line_id: "line-1",
  client_code: "FR-0726-0039",
  client_name: "Abdelaziz Mohamad Al Ajlan",
  production_code: "0119-L01",
  fabric_cut_code: "0119-L01",
  piece_name: "Shirt",
  fabric_number: "722037",
  garment_type: "Shirt",
  supplier_name: "Loro Piana",
  fabric_brand: "Loro Piana",
  composition: '100% COTONE "KNIT SHIRT"',
  weight_gsm: null,
  cut_quantity: 1.5,
  cut_unit: "meters",
  labels_sent: 1,
  article_number: 1,
  sticker_index: 1,
  sticker_total: 37,
  qr_payload: "0119-L01",
};

const mode = process.argv[2] ?? "printer-match";
const parsedMode = mode === "printer-match" ? "printer-match" : Number(mode);

const png = await renderStickerPagePng(label, "prep", new Map(), parsedMode, 100);
const rawPath = resolve(projectRoot, `diag-current-${mode}-raw.png`);
writeFileSync(rawPath, png);
console.log("Raw artifact:", rawPath);

// Simulate the D550 turning the portrait feed 90° so we view it as the physical landscape label.
const simPath = resolve(projectRoot, `diag-current-${mode}-printsim.png`);
execFileSync("cp", [rawPath, simPath]);
execFileSync("sips", ["--rotate", "270", simPath], { stdio: "ignore" });
console.log("Print sim (rotated 270):", simPath);
