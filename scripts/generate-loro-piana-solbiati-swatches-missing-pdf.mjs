#!/usr/bin/env node
/**
 * Printable A4 PDF of Loro Piana (numeric) vs Solbiati (S*) swatch gaps.
 *
 * Usage:
 *   node scripts/generate-loro-piana-solbiati-swatches-missing-pdf.mjs
 *   node scripts/generate-loro-piana-solbiati-swatches-missing-pdf.mjs --out ~/Downloads/custom.pdf
 */

import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcDir = resolve(projectRoot, "src");

const defaultDownloadsPath = resolve(
  homedir(),
  "Downloads",
  "Loro-Piana-Solbiati-swatches-missing.pdf"
);
const defaultDesktopPath = resolve(
  homedir(),
  "Desktop",
  "Loro-Piana-Solbiati-swatches-missing.pdf"
);

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
const downloadsPath = outArg ?? defaultDownloadsPath;
const desktopPath = outArg ? null : defaultDesktopPath;

const jiti = createJiti(import.meta.url, {
  alias: { "@": srcDir },
  interopDefault: true,
});

const {
  compileLoroPianaSolbiatiSwatchesMissing,
  generateLoroPianaSolbiatiSwatchesMissingPdf,
} = await jiti.import(
  resolve(
    srcDir,
    "lib/fabric-sourcing/generate-loro-piana-books-needing-swatches-pdf.ts"
  )
);

const { loro_piana, solbiati } = compileLoroPianaSolbiatiSwatchesMissing();
const pdfBytes = generateLoroPianaSolbiatiSwatchesMissingPdf();

writeFileSync(downloadsPath, Buffer.from(pdfBytes));
console.log(`Wrote ${downloadsPath}`);
console.log(`  Loro Piana: ${loro_piana.total_missing} missing (${loro_piana.zero.length} books at 0%, ${loro_piana.partial.length} partial)`);
console.log(`  Solbiati: ${solbiati.total_missing} missing (${solbiati.zero.length} collections at 0%, ${solbiati.partial.length} partial)`);

if (desktopPath) {
  writeFileSync(desktopPath, Buffer.from(pdfBytes));
  console.log(`Wrote ${desktopPath}`);
}
