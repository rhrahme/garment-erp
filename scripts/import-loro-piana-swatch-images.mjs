#!/usr/bin/env node
/**
 * Import Loro Piana swatch images from a local folder into data/suppliers/loro-piana/images/.
 * Matches N-prefixed filenames (e.g. N721001.jpg) to catalog fabric_number (721001).
 *
 * Usage:
 *   node scripts/import-loro-piana-swatch-images.mjs "/path/to/Australis 270gr"
 *   node scripts/import-loro-piana-swatch-images.mjs "/path/to/folder" --collection Australis --weight 270
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync, readdirSync } from "node:fs";
import { resolve, extname, join, basename } from "node:path";

const ROOT = process.cwd();
const CATALOG_PATH = resolve(ROOT, "src/data/suppliers/loro-piana-ss26.json");
const DEFAULT_OUT = resolve(ROOT, "data/suppliers/loro-piana/images");

function parseArgs(argv) {
  const args = { source: null, out: DEFAULT_OUT, collection: null, weight: null, book: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out" && argv[i + 1]) args.out = resolve(ROOT, argv[++i]);
    else if (arg === "--collection" && argv[i + 1]) args.collection = argv[++i];
    else if (arg === "--weight" && argv[i + 1]) args.weight = Number.parseInt(argv[++i], 10);
    else if (arg === "--book" && argv[i + 1]) args.book = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/import-loro-piana-swatch-images.mjs <source-dir> [options]

Options:
  --out DIR           Output directory (default: data/suppliers/loro-piana/images)
  --collection NAME   Filter catalog by collection substring (case-insensitive)
  --weight GSM        Filter catalog by weight_gsm
  --book NUMBER       Filter catalog by book_number
`);
      process.exit(0);
    } else if (!arg.startsWith("-") && !args.source) {
      args.source = resolve(argv[i]);
    }
  }
  return args;
}

function normalizeFabricNumberFromFilename(filename) {
  const stem = basename(filename, extname(filename)).trim().toUpperCase();
  // NS prefix on paper = Solbiati S prefix (e.g. NS16001 → S16001)
  const withNs = stem.match(/^NS(\d+)$/);
  if (withNs) return `S${withNs[1]}`;
  const withN = stem.match(/^N(\d+)$/);
  if (withN) return withN[1];
  if (/^S\d+$/.test(stem)) return stem;
  if (/^\d{6}$/.test(stem)) return stem;
  return stem;
}

function walkFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (/\.(jpe?g|png|webp)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function filterCatalogFabrics(fabrics, { collection, weight, book }) {
  return fabrics.filter((fabric) => {
    if (book && fabric.book_number !== book) return false;
    if (weight != null && fabric.weight_gsm !== weight) return false;
    if (collection) {
      const needle = collection.toLowerCase();
      const hay = `${fabric.collection ?? ""} ${fabric.category ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

const args = parseArgs(process.argv);
if (!args.source || !existsSync(args.source)) {
  console.error("Source directory is required and must exist.");
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
const catalogFabrics = filterCatalogFabrics(catalog.fabrics ?? [], args);
const catalogByNumber = new Map(catalogFabrics.map((f) => [f.fabric_number, f]));

mkdirSync(args.out, { recursive: true });

const sourceFiles = walkFiles(args.source);
const items = [];
let copied = 0;

for (const sourcePath of sourceFiles.sort()) {
  const sourceFilename = basename(sourcePath);
  const fabricNumber = normalizeFabricNumberFromFilename(sourceFilename);
  const catalogEntry = catalogByNumber.get(fabricNumber);
  const destFilename = `${fabricNumber}${extname(sourceFilename).toLowerCase() || ".jpg"}`;
  const destPath = join(args.out, destFilename);

  if (!catalogEntry) {
    items.push({
      fabric_number: fabricNumber,
      source_filename: sourceFilename,
      source_path: sourcePath,
      filename: destFilename,
      ok: false,
      error: "No matching catalog entry for filters",
    });
    continue;
  }

  copyFileSync(sourcePath, destPath);
  const stat = statSync(destPath);
  copied += 1;
  items.push({
    fabric_number: fabricNumber,
    source_filename: sourceFilename,
    filename: destFilename,
    collection: catalogEntry.collection ?? null,
    book_number: catalogEntry.book_number ?? null,
    weight_gsm: catalogEntry.weight_gsm ?? null,
    ok: true,
    bytes: stat.size,
  });
}

const manifest = {
  imported_at: new Date().toISOString(),
  source: args.source,
  catalog_path: "src/data/suppliers/loro-piana-ss26.json",
  output_root: "data/suppliers/loro-piana/images",
  filters: {
    collection: args.collection,
    weight_gsm: args.weight,
    book_number: args.book,
  },
  naming:
    "N-prefixed order codes (N721001.jpg → 721001.jpg); NS-prefixed Solbiati (NS16001.jpg → S16001.jpg)",
  items,
};

const manifestPath = join(args.out, "manifest.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const okCount = items.filter((item) => item.ok).length;
const failCount = items.length - okCount;
console.log(`Imported ${okCount} swatch image(s) to ${args.out}`);
if (failCount) console.log(`${failCount} file(s) had no catalog match`);
console.log(`Manifest: ${manifestPath}`);
