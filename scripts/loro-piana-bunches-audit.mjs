#!/usr/bin/env node
/**
 * Full audit of Desktop Loro Piana Bunches folders vs manifest + catalog.
 * Usage: node scripts/loro-piana-bunches-audit.mjs [--json]
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { createJiti } from "jiti";

const ROOT = process.cwd();
const BUNCHES_ROOT = "/Users/ralphrahme/Desktop/Loro Piana Bunches";
const MANIFEST_PATH = resolve(ROOT, "data/suppliers/loro-piana/images/manifest.json");
const CATALOG_PATH = resolve(ROOT, "src/data/suppliers/loro-piana-ss26.json");

function inferBookNumberFromLabel(label) {
  const normalized = label.replace(/\s+/g, " ").trim();
  const bookParen = normalized.match(/\(book\s+(\d{3,4})\)/i);
  if (bookParen) return bookParen[1];
  const hashBook = normalized.match(/#\s*(\d{3,4})\b/);
  if (hashBook) return hashBook[1];
  const dashBook = normalized.match(/[-–]\s*(\d{3,4})\s*(?:\.\s*\d+\s*grams?)?\s*$/i);
  if (dashBook) return dashBook[1];
  const solbiati = normalized.match(/\bS(\d{2})\b/i);
  if (solbiati) return `782`; // Solbiati lines share book 782 in catalog
  const trailing = normalized.match(/\s(\d{3,4})\s*$/);
  if (trailing) return trailing[1];
  return null;
}

function normalizeFabricNumberFromFilename(filename) {
  const stem = basename(filename, extname(filename)).trim().toUpperCase().replace(/_\d+$/, "");
  const withNs = stem.match(/^NS(\d+)$/);
  if (withNs) return `S${withNs[1]}`;
  const withN = stem.match(/^N(\d+)$/);
  if (withN) return withN[1];
  if (/^S\d+$/.test(stem)) return stem;
  if (/^\d{6}$/.test(stem)) return stem;
  return null;
}

function walkImageFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkImageFiles(full));
    else if (/\.(jpe?g|png|webp)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function listBunchFolders() {
  const folders = [];
  for (const entry of readdirSync(BUNCHES_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name === "Solbiati") {
      for (const sub of readdirSync(join(BUNCHES_ROOT, "Solbiati"), { withFileTypes: true })) {
        if (!sub.isDirectory()) continue;
        folders.push({
          path: join(BUNCHES_ROOT, "Solbiati", sub.name),
          name: `Solbiati/${sub.name}`,
          book: inferBookNumberFromLabel(sub.name) ?? "782",
          solbiati: true,
        });
      }
    } else {
      folders.push({
        path: join(BUNCHES_ROOT, name),
        name,
        book: inferBookNumberFromLabel(name),
        solbiati: false,
      });
    }
  }
  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

function inventoryFolder(folder) {
  const files = walkImageFiles(folder.path);
  const codes = new Set();
  const rawCodes = new Set();
  for (const file of files) {
    const raw = basename(file, extname(file)).trim().toUpperCase().replace(/_\d+$/, "");
    rawCodes.add(raw);
    const normalized = normalizeFabricNumberFromFilename(basename(file));
    if (normalized) codes.add(normalized);
  }
  return {
    ...folder,
    image_count: files.length,
    unique_codes: [...codes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    raw_prefixes: [...rawCodes].slice(0, 5),
  };
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const manifestFabrics = new Set(
  manifest.items.filter((i) => i.ok).map((i) => i.fabric_number)
);
const manifestSources = new Set(
  (manifest.source ?? "")
    .split(" + ")
    .map((s) => s.trim())
    .filter(Boolean)
);

const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8")).fabrics ?? [];
const catalogByBook = new Map();
for (const f of catalog) {
  const book = f.book_number?.trim();
  if (!book) continue;
  if (!catalogByBook.has(book)) catalogByBook.set(book, { count: 0, collection: f.collection ?? "—" });
  const e = catalogByBook.get(book);
  e.count += 1;
}

const folders = listBunchFolders().map(inventoryFolder);

const folderReports = folders.map((f) => {
  const inManifest = manifestSources.has(f.path);
  const missingFromManifest = f.unique_codes.filter((c) => !manifestFabrics.has(c));
  const alreadyInManifest = f.unique_codes.filter((c) => manifestFabrics.has(c));
  return {
    name: f.name,
    book: f.book ?? "—",
    image_count: f.image_count,
    unique_code_count: f.unique_codes.length,
    codes_sample: f.unique_codes.slice(0, 3).join(", ") + (f.unique_codes.length > 3 ? "…" : ""),
    folder_imported: inManifest,
    codes_in_manifest: alreadyInManifest.length,
    codes_missing_from_manifest: missingFromManifest.length,
    missing_codes_sample: missingFromManifest.slice(0, 5).join(", "),
    needs_import: missingFromManifest.length > 0 || !inManifest,
    path: f.path,
  };
});

// Catalog coverage
const jiti = createJiti(import.meta.url, {
  alias: { "@": resolve(ROOT, "src") },
  interopDefault: true,
});
const { compileLoroPianaBooksNeedingSwatches } = await jiti.import(
  resolve(ROOT, "src/lib/fabric-sourcing/generate-loro-piana-books-needing-swatches-pdf.ts")
);
const { zero, partial } = compileLoroPianaBooksNeedingSwatches();

// Books with folders on desktop
const desktopBooks = new Set(folders.map((f) => f.book).filter(Boolean));
const zeroWithFolder = zero.filter((b) => desktopBooks.has(b.book_number));
const zeroNoFolder = zero.filter((b) => !desktopBooks.has(b.book_number));
const partialWithFolder = partial.filter((b) => desktopBooks.has(b.book_number));

const report = {
  scanned_at: new Date().toISOString(),
  bunches_root: BUNCHES_ROOT,
  folder_count: folders.length,
  manifest_total: manifestFabrics.size,
  folders: folderReports,
  folders_needing_import: folderReports.filter((f) => f.needs_import),
  catalog: {
    zero_count: zero.length,
    partial_count: partial.length,
    zero_still_no_folder: zeroNoFolder.map((b) => ({
      book: b.book_number,
      collection: b.collection,
      catalog_count: b.catalog_count,
    })),
    zero_has_folder_but_not_covered: zeroWithFolder.map((b) => ({
      book: b.book_number,
      collection: b.collection,
      catalog_count: b.catalog_count,
    })),
    partial_still_gaps: partial.map((b) => ({
      book: b.book_number,
      collection: b.collection,
      have: b.have_count,
      missing: b.missing_count,
      pct: b.coverage_pct,
      has_folder: desktopBooks.has(b.book_number),
    })),
  },
};

const jsonOut = process.argv.includes("--json");
if (jsonOut) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("=== LORO PIANA BUNCHES INVENTORY ===\n");
  console.log(`Folders scanned: ${folders.length} | Manifest swatches: ${manifestFabrics.size}\n`);
  console.log("Folder | Book | Images | Unique codes | In manifest | Missing codes");
  console.log("-".repeat(90));
  for (const f of folderReports) {
    const flag = f.needs_import ? " ⚠" : " ✓";
    console.log(
      `${f.name.slice(0, 40).padEnd(40)} | ${String(f.book).padEnd(4)} | ${String(f.image_count).padStart(5)} | ${String(f.unique_code_count).padStart(5)} | ${String(f.codes_in_manifest).padStart(5)}/${f.unique_code_count} | ${f.codes_missing_from_manifest}${flag}`
    );
  }
  console.log("\n=== CATALOG: ZERO SWATCH BOOKS ===");
  console.log(`Still no Desktop folder (${zeroNoFolder.length}):`);
  for (const b of zeroNoFolder) console.log(`  Book ${b.book_number} — ${b.collection} (${b.catalog_count} fabrics)`);
  console.log(`\nHas folder but 0% coverage (${zeroWithFolder.length}):`);
  for (const b of zeroWithFolder) console.log(`  Book ${b.book_number} — ${b.collection} (${b.catalog_count} fabrics)`);
  console.log(`\n=== CATALOG: PARTIAL BOOKS (${partial.length}) ===`);
  for (const b of partial) {
    const folderNote = desktopBooks.has(b.book_number) ? "has folder" : "NO folder";
    console.log(`  Book ${b.book_number} — ${b.collection}: ${b.have_count}/${b.catalog_count} (${b.coverage_pct}%) [${folderNote}]`);
  }
  console.log(`\nFolders needing import: ${report.folders_needing_import.length}`);
}
