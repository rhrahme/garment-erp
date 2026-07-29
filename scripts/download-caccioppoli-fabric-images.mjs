#!/usr/bin/env node
/**
 * Download Caccioppoli fabric swatch images via GR Sistemi CUSTOM API.
 *
 * Prefers bulk POST /caccioppoli/getImages (paginated). Falls back to
 * getItemImages for catalog codes missing from the bulk dump.
 *
 * Catalog/specs stay in static JSON ù this script only caches images.
 * Stock availability remains a separate live API sync.
 *
 * Requires CACCIOPPOLI_API_TOKEN in .env.local
 *
 * Usage:
 *   node scripts/download-caccioppoli-fabric-images.mjs
 *   node scripts/download-caccioppoli-fabric-images.mjs --all
 *   node scripts/download-caccioppoli-fabric-images.mjs --limit 20
 *   node scripts/download-caccioppoli-fabric-images.mjs --codes 360102,360101
 *   node scripts/download-caccioppoli-fabric-images.mjs --catalog-only
 *   node scripts/download-caccioppoli-fabric-images.mjs --retry-failed
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "data/suppliers/caccioppoli/images");
const MANIFEST_PATH = join(OUT_DIR, "manifest.json");
const CATALOG_PATHS = [
  resolve(ROOT, "src/data/suppliers/caccioppoli-jackets-ss26.json"),
  resolve(ROOT, "src/data/suppliers/caccioppoli-shirting-ss26.json"),
];
const PAGE_SIZE = 25;
const DEFAULT_BASE = "https://api-service.grsis.it";

function loadEnvLocal() {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {
    limit: 50,
    all: false,
    codes: null,
    catalogOnly: false,
    fillCatalog: false,
    retryFailed: false,
    delayMs: 150,
    pageSize: PAGE_SIZE,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit" && argv[i + 1]) args.limit = Number.parseInt(argv[++i], 10);
    else if (arg === "--all") args.all = true;
    else if (arg === "--catalog-only") args.catalogOnly = true;
    else if (arg === "--fill-catalog") args.fillCatalog = true;
    else if (arg === "--retry-failed") args.retryFailed = true;
    else if (arg === "--codes" && argv[i + 1]) args.codes = argv[++i].split(/[,\s]+/).filter(Boolean);
    else if (arg === "--delay-ms" && argv[i + 1]) args.delayMs = Number.parseInt(argv[++i], 10);
    else if (arg === "--page-size" && argv[i + 1]) args.pageSize = Number.parseInt(argv[++i], 10);
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/download-caccioppoli-fabric-images.mjs [options]

Options:
  --all            Download full getImages dump (and catalog fill-ins)
  --limit N        Max unique fabrics when not using --all (default: 50)
  --codes A,B,C    Specific fabric numbers via getItemImages
  --catalog-only   Only request catalog fabric codes (skip bulk dump)
  --fill-catalog   After getImages, also probe missing SS26 catalog codes via getItemImages
  --retry-failed   Re-try failed/missing entries from existing manifest
  --delay-ms N     Pause between API calls (default: 150)
  --page-size N    getImages page size (default: 25)

Note: Shirting codes (206xxx) often have stock in the API but no swatch images.
`);
      process.exit(0);
    }
  }
  if (args.codes?.length || args.retryFailed) args.all = true;
  return args;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function normalizeCode(code) {
  return String(code ?? "")
    .trim()
    .replace(/\s+/g, "");
}

function loadCatalogCodes() {
  const codes = new Set();
  for (const catalogPath of CATALOG_PATHS) {
    if (!existsSync(catalogPath)) continue;
    const data = JSON.parse(readFileSync(catalogPath, "utf8"));
    for (const fabric of data.fabrics ?? []) {
      const code = normalizeCode(fabric.fabric_number);
      if (code) codes.add(code);
    }
  }
  return [...codes];
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    return {
      downloaded_at: null,
      source: "caccioppoli-getImages",
      catalog_paths: CATALOG_PATHS.map((p) => p.replace(`${ROOT}/`, "")),
      items: [],
    };
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}

function writeManifest(manifest) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function imageBufferFromBase64(imgData) {
  const trimmed = String(imgData ?? "").trim();
  if (!trimmed) return null;
  const raw = trimmed.startsWith("data:") ? trimmed.split(",")[1] ?? "" : trimmed;
  if (!raw) return null;
  return Buffer.from(raw, "base64");
}

function pickPrimaryImage(rows) {
  if (!rows?.length) return null;
  const sorted = [...rows].sort((a, b) => (a.rowNumber ?? 99) - (b.rowNumber ?? 99));
  return sorted.find((row) => row.rowNumber === 1) ?? sorted[0] ?? null;
}

async function caccioppoliPost(base, token, path, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const error = await response.json();
      if (error.message) message = error.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return response.json();
}

function upsertItem(byCode, item) {
  byCode.set(item.fabric_number, item);
}

function savePrimaryImage(row) {
  const fabricNumber = normalizeCode(row.item);
  if (!fabricNumber) return { ok: false, fabric_number: "", error: "Empty item code" };

  const buffer = imageBufferFromBase64(row.imgData);
  if (!buffer?.length) {
    return { ok: false, fabric_number: fabricNumber, error: "Empty image payload", image_id: row.id };
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const filename = `${fabricNumber}.jpg`;
  const filePath = join(OUT_DIR, filename);
  writeFileSync(filePath, buffer);
  return {
    ok: true,
    fabric_number: fabricNumber,
    filename,
    bytes: buffer.length,
    image_id: row.id,
  };
}

loadEnvLocal();
const args = parseArgs(process.argv);
const token = process.env.CACCIOPPOLI_API_TOKEN?.trim();
const base = (process.env.CACCIOPPOLI_API_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, "");

if (!token) {
  console.error("CACCIOPPOLI_API_TOKEN is not set in .env.local");
  process.exit(1);
}

const manifest = loadManifest();
const byCode = new Map(
  (manifest.items ?? []).map((item) => [normalizeCode(item.fabric_number), item])
);

let downloaded = 0;
let skipped = 0;
let failed = 0;
let noImage = 0;

async function ensureSavedFromBulk(row) {
  const fabricNumber = normalizeCode(row.item);
  const existing = byCode.get(fabricNumber);
  const filename = `${fabricNumber}.jpg`;
  const filePath = join(OUT_DIR, filename);

  if (existing?.ok && existsSync(filePath) && !args.retryFailed) {
    skipped += 1;
    return;
  }

  // Prefer rowNumber 1; if we already have an ok file, keep it unless this is row 1 replacing a worse one.
  if (existsSync(filePath) && existing?.ok && row.rowNumber !== 1 && !args.retryFailed) {
    skipped += 1;
    return;
  }

  try {
    const saved = savePrimaryImage(row);
    upsertItem(byCode, saved);
    if (saved.ok) {
      downloaded += 1;
      console.log(`Saved ${saved.fabric_number} (${saved.bytes} bytes, id=${saved.image_id})`);
    } else {
      failed += 1;
      console.warn(`Failed ${fabricNumber}: ${saved.error}`);
    }
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    upsertItem(byCode, { ok: false, fabric_number: fabricNumber, error: message, image_id: row.id });
    console.warn(`Failed ${fabricNumber}: ${message}`);
  }
}

async function downloadViaGetImages() {
  console.log("Fetching bulk images via getImagesù");
  let fromId = 0;
  let pages = 0;
  /** Keep best row per item (prefer rowNumber 1). */
  const bestByItem = new Map();

  while (true) {
    const payload = await caccioppoliPost(base, token, "/caccioppoli/getImages", {
      number_of_records: args.pageSize,
      from_id: fromId,
    });
    const data = payload.data ?? [];
    if (data.length === 0) break;

    pages += 1;
    for (const row of data) {
      const code = normalizeCode(row.item);
      if (!code) continue;
      const current = bestByItem.get(code);
      if (!current || (row.rowNumber === 1 && current.rowNumber !== 1)) {
        bestByItem.set(code, row);
      }
    }

    fromId = data[data.length - 1].id;
    process.stdout.write(`\r  pages=${pages} unique=${bestByItem.size} lastId=${fromId}`);
    if (data.length < args.pageSize) break;
    if (!args.all && bestByItem.size >= args.limit) break;
    await sleep(args.delayMs);
  }
  process.stdout.write("\n");

  const rows = [...bestByItem.values()];
  const limited = args.all ? rows : rows.slice(0, args.limit);
  console.log(`Writing ${limited.length} primary swatch(es)ù`);
  for (const row of limited) {
    await ensureSavedFromBulk(row);
  }
}

async function downloadViaGetItemImages(codes) {
  console.log(`Looking up ${codes.length} code(s) via getItemImagesù`);
  for (const code of codes) {
    const fabricNumber = normalizeCode(code);
    const filename = `${fabricNumber}.jpg`;
    const filePath = join(OUT_DIR, filename);
    const existing = byCode.get(fabricNumber);

    if (existing?.ok && existsSync(filePath) && !args.retryFailed) {
      skipped += 1;
      continue;
    }

    try {
      const payload = await caccioppoliPost(base, token, "/caccioppoli/getItemImages", {
        item: fabricNumber,
      });
      const primary = pickPrimaryImage(payload.data ?? []);
      if (!primary) {
        noImage += 1;
        upsertItem(byCode, {
          ok: false,
          fabric_number: fabricNumber,
          error: "No swatch images returned for this item.",
        });
        console.warn(`No image: ${fabricNumber}`);
      } else {
        const saved = savePrimaryImage(primary);
        upsertItem(byCode, saved);
        if (saved.ok) {
          downloaded += 1;
          console.log(`Saved ${saved.fabric_number} (${saved.bytes} bytes)`);
        } else {
          failed += 1;
          console.warn(`Failed ${fabricNumber}: ${saved.error}`);
        }
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      upsertItem(byCode, { ok: false, fabric_number: fabricNumber, error: message });
      console.warn(`Failed ${fabricNumber}: ${message}`);
    }
    await sleep(args.delayMs);
  }
}

const catalogCodes = loadCatalogCodes();
console.log(`Catalog codes: ${catalogCodes.length}`);

if (args.codes?.length) {
  await downloadViaGetItemImages(args.codes);
} else if (args.catalogOnly) {
  const codes = args.all ? catalogCodes : catalogCodes.slice(0, args.limit);
  await downloadViaGetItemImages(codes);
} else if (args.retryFailed) {
  const retryCodes = [...byCode.values()]
    .filter((item) => !item.ok || (item.filename && !existsSync(join(OUT_DIR, item.filename))))
    .map((item) => item.fabric_number);
  console.log(`Retrying ${retryCodes.length} failed/missing code(s)`);
  await downloadViaGetImages();
  const stillMissing = catalogCodes.filter((code) => {
    const item = byCode.get(code);
    return !item?.ok || !item.filename || !existsSync(join(OUT_DIR, item.filename));
  });
  if (stillMissing.length) await downloadViaGetItemImages(stillMissing);
} else {
  await downloadViaGetImages();
  // Optional: probe SS26 catalog codes missing from the bulk image dump.
  // Most shirting (206xxx) have availability but no images ó skip unless --fill-catalog.
  if (args.fillCatalog) {
    const missingCatalog = catalogCodes.filter((code) => {
      const item = byCode.get(code);
      return !item?.ok;
    });
    const fill = args.all ? missingCatalog : missingCatalog.slice(0, Math.max(0, args.limit - downloaded));
    if (fill.length > 0) {
      console.log(`Catalog fill-in for ${fill.length} code(s) missing from getImagesÖ`);
      await downloadViaGetItemImages(fill);
    }
  } else {
    const missing = catalogCodes.filter((code) => !byCode.get(code)?.ok).length;
    if (missing > 0) {
      console.log(
        `Skipped catalog fill-in for ${missing} SS26 code(s) with no bulk image (use --fill-catalog to probe).`
      );
    }
  }
}

const items = [...byCode.values()].sort((a, b) =>
  a.fabric_number.localeCompare(b.fabric_number, undefined, { numeric: true })
);
const okCount = items.filter((item) => item.ok).length;

writeManifest({
  downloaded_at: new Date().toISOString(),
  source: "caccioppoli-getImages+getItemImages",
  catalog_paths: CATALOG_PATHS.map((p) => p.replace(`${ROOT}/`, "")),
  items,
});

console.log(
  `Done. ok=${okCount}/${items.length} downloaded=${downloaded} skipped=${skipped} noImage=${noImage} failed=${failed}`
);
console.log(`Manifest: ${MANIFEST_PATH}`);
if (okCount > 0) {
  const sample = items.find((item) => item.ok && item.filename);
  if (sample) {
    const size = statSync(join(OUT_DIR, sample.filename)).size;
    console.log(`Sample: ${sample.fabric_number} (${size} bytes)`);
  }
}
