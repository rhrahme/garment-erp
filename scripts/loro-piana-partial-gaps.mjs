#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createJiti } from "jiti";

const ROOT = process.cwd();
const jiti = createJiti(import.meta.url, { alias: { "@": resolve(ROOT, "src") }, interopDefault: true });
const { compileLoroPianaBooksNeedingSwatches } = await jiti.import(
  resolve(ROOT, "src/lib/fabric-sourcing/generate-loro-piana-books-needing-swatches-pdf.ts")
);

const catalog = JSON.parse(readFileSync(resolve(ROOT, "src/data/suppliers/loro-piana-ss26.json"), "utf8")).fabrics;
const manifest = JSON.parse(readFileSync(resolve(ROOT, "data/suppliers/loro-piana/images/manifest.json"), "utf8"));
const imported = new Set(manifest.items.filter((i) => i.ok).map((i) => i.fabric_number));
const { partial } = compileLoroPianaBooksNeedingSwatches();

for (const book of partial) {
  const fabrics = catalog.filter((f) => f.book_number === book.book_number);
  const missing = fabrics.filter((f) => !imported.has(f.fabric_number)).map((f) => f.fabric_number);
  console.log(`Book ${book.book_number} (${book.collection}): ${book.have_count}/${book.catalog_count} — missing ${missing.length}`);
  if (missing.length) console.log(`  ${missing.join(", ")}`);
}
