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
  const args = {
    source: null,
    out: DEFAULT_OUT,
    collection: null,
    weight: null,
    book: null,
    merge: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out" && argv[i + 1]) args.out = resolve(ROOT, argv[++i]);
    else if (arg === "--collection" && argv[i + 1]) args.collection = argv[++i];
    else if (arg === "--weight" && argv[i + 1]) args.weight = Number.parseInt(argv[++i], 10);
    else if (arg === "--book" && argv[i + 1]) args.book = argv[++i];
    else if (arg === "--merge") args.merge = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/import-loro-piana-swatch-images.mjs <source-dir> [options]

Options:
  --out DIR           Output directory (default: data/suppliers/loro-piana/images)
  --collection NAME   Filter catalog by collection substring (case-insensitive)
  --weight GSM        Filter catalog by weight_gsm
  --book NUMBER       Filter catalog by book_number
  --merge             Append to existing manifest.json instead of replacing it
`);
      process.exit(0);
    } else if (!arg.startsWith("-") && !args.source) {
      args.source = resolve(argv[i]);
    }
  }
  return args;
}

function normalizeFabricNumberFromFilename(filename) {
  const stem = basename(filename, extname(filename))
    .trim()
    .toUpperCase()
    .replace(/_\d+$/, "");
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

  copyFileSync(sourcePath, destPath);
  const stat = statSync(destPath);
  copied += 1;

  if (!catalogEntry) {
    items.push({
      fabric_number: fabricNumber,
      source_filename: sourceFilename,
      source_path: sourcePath,
      filename: destFilename,
      ok: true,
      catalog_match: false,
      bytes: stat.size,
      note: "Copied swatch even though fabric is not in the filtered catalog (e.g. sold out).",
    });
    continue;
  }

  items.push({
    fabric_number: fabricNumber,
    source_filename: sourceFilename,
    filename: destFilename,
    collection: catalogEntry.collection ?? null,
    book_number: catalogEntry.book_number ?? null,
    weight_gsm: catalogEntry.weight_gsm ?? null,
    ok: true,
    catalog_match: true,
    bytes: stat.size,
  });
}

const manifestPath = join(args.out, "manifest.json");
const existingManifest =
  args.merge && existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : null;

const mergedByFabric = new Map(
  (existingManifest?.items ?? []).map((item) => [item.fabric_number, item])
);
for (const item of items) mergedByFabric.set(item.fabric_number, item);

const collectionLabel =
  args.collection ??
  basename(args.source).replace(/\s+/g, " ").trim();

const manifest = {
  imported_at: new Date().toISOString(),
  source: existingManifest?.source
    ? `${existingManifest.source} + ${args.source}`
    : args.source,
  catalog_path: "src/data/suppliers/loro-piana-ss26.json",
  output_root: "data/suppliers/loro-piana/images",
  filters: {
    collections: existingManifest?.filters?.collections
      ? [...new Set([...existingManifest.filters.collections, collectionLabel])]
      : collectionLabel
        ? [collectionLabel]
        : undefined,
    collection: args.collection,
    weight_gsm: args.weight,
    book_number: args.book,
    note: existingManifest?.filters?.note ?? (args.merge ? "Merged manifest from multiple imports" : undefined),
  },
  naming:
    "N-prefixed order codes (N721001.jpg → 721001.jpg); NS-prefixed Solbiati (NS16001.jpg → S16001.jpg); _0 suffix stripped (N784001_0.jpg → 784001.jpg)",
  items: [...mergedByFabric.values()].sort((a, b) =>
    a.fabric_number.localeCompare(b.fabric_number, undefined, { numeric: true })
  ),
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const okCount = items.filter((item) => item.ok).length;
const noCatalogCount = items.filter((item) => item.ok && !item.catalog_match).length;
const totalOk = manifest.items.filter((item) => item.ok).length;
console.log(`Imported ${okCount} swatch image(s) to ${args.out}`);
if (noCatalogCount) console.log(`${noCatalogCount} file(s) had no catalog match`);
if (args.merge) console.log(`Manifest total: ${totalOk} ok item(s)`);
console.log(`Manifest: ${manifestPath}`);
