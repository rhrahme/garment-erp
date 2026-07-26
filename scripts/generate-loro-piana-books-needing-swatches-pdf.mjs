#!/usr/bin/env node
/**
 * Printable A4 PDF of Loro Piana / Solbiati catalog books missing swatch photos.
 *
 * Usage:
 *   node scripts/generate-loro-piana-books-needing-swatches-pdf.mjs
 *   node scripts/generate-loro-piana-books-needing-swatches-pdf.mjs --out ~/Desktop/custom-name.pdf
 */

import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcDir = resolve(projectRoot, "src");

const defaultDesktopPath = resolve(
  homedir(),
  "Desktop",
  "Loro-Piana-books-needing-swatches.pdf"
);
const defaultRepoPath = resolve(projectRoot, "Loro-Piana-books-needing-swatches.pdf");

function parseOutArg(argv) {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) {
      const raw = argv[++i];
      return raw.startsWith("~") ? resolve(homedir(), raw.slice(2)) : resolve(raw);
    }
  }
  return null;
}

const outArg = parseOutArg(process.argv);
const desktopPath = outArg ?? defaultDesktopPath;
const repoPath = outArg ? null : defaultRepoPath;

const jiti = createJiti(import.meta.url, {
  alias: { "@": srcDir },
  interopDefault: true,
});

const {
  compileLoroPianaBooksNeedingSwatches,
  generateLoroPianaBooksNeedingSwatchesPdf,
} = await jiti.import(
  resolve(
    srcDir,
    "lib/fabric-sourcing/generate-loro-piana-books-needing-swatches-pdf.ts"
  )
);

const { zero, partial } = compileLoroPianaBooksNeedingSwatches();
const pdfBytes = generateLoroPianaBooksNeedingSwatchesPdf();

writeFileSync(desktopPath, Buffer.from(pdfBytes));
console.log(`Wrote ${desktopPath}`);
console.log(`  Section A (zero swatches): ${zero.length} books`);
console.log(`  Section B (partial): ${partial.length} books`);

if (repoPath) {
  writeFileSync(repoPath, Buffer.from(pdfBytes));
  console.log(`Wrote ${repoPath}`);
}
