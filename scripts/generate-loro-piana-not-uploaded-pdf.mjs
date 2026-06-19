#!/usr/bin/env node
/**
 * One-page PDF listing Loro Piana / Solbiati swatches not uploaded during import.
 * Usage: node scripts/generate-loro-piana-not-uploaded-pdf.mjs
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcDir = resolve(projectRoot, "src");
const OUT_PATH = resolve(projectRoot, "loro-piana-swatches-not-uploaded.pdf");

const jiti = createJiti(import.meta.url, {
  alias: { "@": srcDir },
  interopDefault: true,
});

const {
  compileLoroPianaMissingSwatchRows,
  generateLoroPianaMissingSwatchesPdf,
} = await jiti.import(
  resolve(srcDir, "lib/fabric-sourcing/generate-loro-piana-missing-swatches-pdf.ts")
);

const rows = compileLoroPianaMissingSwatchRows();
const pdfBytes = generateLoroPianaMissingSwatchesPdf();
writeFileSync(OUT_PATH, Buffer.from(pdfBytes));

const noCatalog = rows.filter((r) => r.reason === "No catalog entry").length;
const missingImage = rows.filter((r) => r.reason === "Image missing from folder").length;

console.log(`Wrote ${OUT_PATH}`);
console.log(`Total not uploaded: ${rows.length}`);
console.log(`  No catalog entry: ${noCatalog}`);
console.log(`  Image missing from folder: ${missingImage}`);
