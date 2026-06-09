#!/usr/bin/env node
/**
 * Download Drapers fabric swatch images via official API (GET /fabrics/{code}/medias/).
 * Uses zoom URLs (high resolution) from drapersitaly.it — no scraping required.
 *
 * Requires DRAPERS_API_KEY in .env.local
 *
 * Usage:
 *   node scripts/download-drapers-fabric-images.mjs
 *   node scripts/download-drapers-fabric-images.mjs --limit 10
 *   node scripts/download-drapers-fabric-images.mjs --quality zoom --out data/suppliers/drapers/images
 *   node scripts/download-drapers-fabric-images.mjs --quality best --out data/suppliers/drapers/images-higher
 *   node scripts/download-drapers-fabric-images.mjs --best --limit 10
 *   node scripts/download-drapers-fabric-images.mjs --codes 10101,90640,85119
 *   node scripts/download-drapers-fabric-images.mjs --by-collection --best --limit 20
 *   node scripts/download-drapers-fabric-images.mjs --by-collection --best --all
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, extname } from "node:path";

const ROOT = process.cwd();
const CATALOG_PATH = resolve(ROOT, "src/data/suppliers/drapers-hs-ss26.json");
const DEFAULT_OUT = resolve(ROOT, "data/suppliers/drapers/images");
const BEST_OUT = resolve(ROOT, "data/suppliers/drapers/images-higher");
const BY_COLLECTION_OUT = resolve(ROOT, "data/suppliers/drapers/images-by-collection");
const BASE = (process.env.DRAPERS_API_BASE_URL || "https://api.drapersitaly.it").replace(/\/$/, "");

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
    limit: 10,
    all: false,
    quality: "zoom",
    out: null,
    codes: null,
    delayMs: 200,
    byCollection: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit" && argv[i + 1]) args.limit = Number.parseInt(argv[++i], 10);
    else if (arg === "--all") args.all = true;
    else if (arg === "--quality" && argv[i + 1]) args.quality = argv[++i];
    else if (arg === "--best") args.quality = "best";
    else if (arg === "--by-collection") args.byCollection = true;
    else if (arg === "--out" && argv[i + 1]) args.out = resolve(ROOT, argv[++i]);
    else if (arg === "--codes" && argv[i + 1]) args.codes = argv[++i].split(/[,\s]+/).filter(Boolean);
    else if (arg === "--delay-ms" && argv[i + 1]) args.delayMs = Number.parseInt(argv[++i], 10);
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/download-drapers-fabric-images.mjs [options]

Options:
  --limit N       Max fabrics to download (default: 10; use --all for full catalog)
  --all           Download all fabrics in catalog (overrides --limit)
  --quality TYPE  square | zoom | ruler | best (default: zoom — highest practical swatch)
  --best          Shorthand for --quality best (compares zoom + ruler + square)
  --by-collection Organize into {collection-slug}/{fabric_number}.jpg under images-by-collection/
  --out DIR       Output directory (default: images/, images-higher/, or images-by-collection/)
  --codes A,B,C   Specific fabric numbers instead of catalog order
  --delay-ms N    Pause between API calls (default: 200)
`);
      process.exit(0);
    }
  }
  if (args.byCollection) {
    args.quality = "best";
    if (!args.out) args.out = BY_COLLECTION_OUT;
  } else if (!args.out) {
    args.out = args.quality === "best" ? BEST_OUT : DEFAULT_OUT;
  }
  return args;
}

function normalizeCode(n) {
  return n.trim().replace(/\s+/g, "").replace(/^DP/i, "");
}

function codeCandidates(fabricNumber) {
  const trimmed = fabricNumber.trim();
  const normalized = normalizeCode(trimmed);
  const out = [];
  for (const c of [normalized, trimmed, `DP${normalized}`]) {
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

async function apiGet(path, query = {}) {
  const key = process.env.DRAPERS_API_KEY?.trim();
  if (!key) throw new Error("DRAPERS_API_KEY missing in .env.local");
  const url = new URL(`${BASE}/${path.replace(/^\//, "").replace(/\/$/, "")}/`);
  url.searchParams.set("ak", key);
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  const json = await res.json();
  if (json.status === "error") throw new Error(json.error?.message || "API error");
  return json;
}

async function lookupMedias(fabricNumber) {
  let lastErr = null;
  for (const code of codeCandidates(fabricNumber)) {
    try {
      const payload = await apiGet(`fabrics/${encodeURIComponent(code)}/medias`);
      const medias = Array.isArray(payload.data) ? payload.data[0] : payload.data;
      if (medias?.square) return { ok: true, fabric_code: code, medias };
      lastErr = "No swatch images returned";
    } catch (err) {
      lastErr = err instanceof Error ? err.message : "media lookup failed";
    }
  }
  return { ok: false, fabric_code: fabricNumber, error: lastErr ?? "lookup failed" };
}

function pickImageUrl(medias, quality) {
  const order =
    quality === "square"
      ? ["square", "zoom", "ruler"]
      : quality === "ruler"
        ? ["ruler", "zoom", "square"]
        : ["zoom", "ruler", "square"];
  for (const key of order) {
    if (medias[key]) return { url: medias[key], quality: key };
  }
  return null;
}

function extFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = extname(pathname).toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp") return ext;
  } catch {
    /* ignore */
  }
  return ".jpg";
}

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function downloadImage(url, destPath) {
  const buf = await fetchImageBuffer(url);
  writeFileSync(destPath, buf);
  return buf.length;
}

function readPngDimensions(buf) {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readJpegDimensions(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) break;
    const marker = buf[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    const segmentLength = buf.readUInt16BE(offset + 2);
    if (segmentLength < 2) break;
    offset += 2 + segmentLength;
  }
  return null;
}

function readImageDimensions(buf) {
  return readPngDimensions(buf) ?? readJpegDimensions(buf);
}

function candidateKeysForBest(medias) {
  const keys = ["zoom", "ruler"];
  if (medias.square) keys.push("square");
  return keys.filter((key) => medias[key]);
}

function compareCandidates(a, b) {
  const aPixels = (a.width ?? 0) * (a.height ?? 0);
  const bPixels = (b.width ?? 0) * (b.height ?? 0);
  if (bPixels !== aPixels) return bPixels - aPixels;
  return b.bytes - a.bytes;
}

async function compareMediaCandidates(medias) {
  const candidates = [];
  for (const key of candidateKeysForBest(medias)) {
    const url = medias[key];
    try {
      const buf = await fetchImageBuffer(url);
      const dims = readImageDimensions(buf);
      candidates.push({
        key,
        quality: key,
        url,
        buf,
        bytes: buf.length,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      });
    } catch {
      /* try next candidate */
    }
  }
  if (!candidates.length) return null;
  candidates.sort(compareCandidates);
  const best = candidates[0];
  const compared = candidates.map((c, i) => ({
    key: c.key,
    url: c.url,
    bytes: c.bytes,
    width: c.width,
    height: c.height,
    selected: i === 0,
  }));
  return { best, compared };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** "PE23 - BLAZON" → blazon; "AI25 - SUPERBIO & BEAUSOLEIL" → superbio-beausoleil */
function collectionSlug(collection) {
  if (!collection || !String(collection).trim()) return "uncategorized";
  let name = String(collection).trim();
  name = name.replace(/^[A-Z]{2}\d{2}\s*-\s*/i, "");
  name = name.toLowerCase().replace(/&/g, " ");
  name = name.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
  return name || "uncategorized";
}

function loadCatalogFabrics(codesArg) {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  const fabrics = (catalog.fabrics ?? [])
    .map((f) => ({
      fabric_number: String(f.fabric_number).trim(),
      collection: f.collection ?? null,
    }))
    .filter((f) => f.fabric_number);

  if (codesArg?.length) {
    const byNumber = new Map(fabrics.map((f) => [f.fabric_number, f]));
    return codesArg.map((code) => byNumber.get(code) ?? { fabric_number: code, collection: null });
  }
  return fabrics;
}

loadEnvLocal();
const args = parseArgs(process.argv);

if (!existsSync(CATALOG_PATH) && !args.codes) {
  console.error(`Catalog not found: ${CATALOG_PATH}`);
  process.exit(1);
}

mkdirSync(args.out, { recursive: true });

const allFabrics = loadCatalogFabrics(args.codes);
const targets = args.all ? allFabrics : allFabrics.slice(0, args.limit);

console.log(`Drapers fabric image download`);
console.log(`  Catalog: ${CATALOG_PATH} (${allFabrics.length} fabrics)`);
console.log(`  Output:  ${args.out}`);
console.log(`  Quality: ${args.quality}${args.byCollection ? " (by-collection mode)" : ""}`);
console.log(`  Limit:   ${args.all ? "all" : targets.length} fabric(s)\n`);

const originalManifestPath = resolve(ROOT, "data/suppliers/drapers/images/manifest.json");
const originalByFabric = new Map();
if (existsSync(originalManifestPath)) {
  const original = JSON.parse(readFileSync(originalManifestPath, "utf8"));
  for (const item of original.items ?? []) {
    if (item.ok) originalByFabric.set(item.fabric_number, item);
  }
}

const manifest = {
  downloaded_at: new Date().toISOString(),
  source: "Drapers API GET /fabrics/{code}/medias/",
  catalog_path: "src/data/suppliers/drapers-hs-ss26.json",
  quality_requested: args.quality,
  output_root: args.out.replace(`${ROOT}/`, "").replace(/\\/g, "/"),
  by_collection: args.byCollection,
  compare_against: existsSync(originalManifestPath) ? "data/suppliers/drapers/images/manifest.json" : null,
  items: [],
  collections: {},
};

let okCount = 0;
let failCount = 0;

function bumpCollectionCount(slug, field) {
  if (!manifest.collections[slug]) {
    manifest.collections[slug] = { ok: 0, failed: 0, skipped: 0 };
  }
  manifest.collections[slug][field] += 1;
}

for (const fabric of targets) {
  const fabricNumber = fabric.fabric_number;
  const slug = args.byCollection ? collectionSlug(fabric.collection) : null;
  const label = args.byCollection ? `${fabricNumber} [${slug}]` : fabricNumber;
  process.stdout.write(`${label} ... `);
  try {
    const result = await lookupMedias(fabricNumber);
    if (!result.ok) {
      console.log(`SKIP (${result.error})`);
      manifest.items.push({
        fabric_number: fabricNumber,
        collection: fabric.collection,
        collection_slug: slug,
        ok: false,
        error: result.error,
      });
      if (args.byCollection) bumpCollectionCount(slug, "failed");
      failCount += 1;
      await sleep(args.delayMs);
      continue;
    }

    let picked;
    let bytes;
    let width = null;
    let height = null;
    let compared = null;
    let imageBuf = null;

    if (args.quality === "best") {
      const result_best = await compareMediaCandidates(result.medias);
      if (!result_best) {
        console.log("SKIP (no downloadable image)");
        manifest.items.push({
          fabric_number: fabricNumber,
          collection: fabric.collection,
          collection_slug: slug,
          ok: false,
          error: "no downloadable image",
        });
        if (args.byCollection) bumpCollectionCount(slug, "failed");
        failCount += 1;
        await sleep(args.delayMs);
        continue;
      }
      const { best, compared: comparedCandidates } = result_best;
      picked = { url: best.url, quality: best.quality };
      bytes = best.bytes;
      width = best.width;
      height = best.height;
      imageBuf = best.buf;
      compared = comparedCandidates;
    } else {
      picked = pickImageUrl(result.medias, args.quality);
      if (!picked) {
        console.log("SKIP (no image URL)");
        manifest.items.push({
          fabric_number: fabricNumber,
          collection: fabric.collection,
          collection_slug: slug,
          ok: false,
          error: "no image URL",
        });
        if (args.byCollection) bumpCollectionCount(slug, "failed");
        failCount += 1;
        await sleep(args.delayMs);
        continue;
      }
      imageBuf = await fetchImageBuffer(picked.url);
      bytes = imageBuf.length;
      const dims = readImageDimensions(imageBuf);
      width = dims?.width ?? null;
      height = dims?.height ?? null;
    }

    const ext = extFromUrl(picked.url);
    const baseName = `${normalizeCode(fabricNumber)}${ext}`;
    const destDir = args.byCollection ? resolve(args.out, slug) : args.out;
    mkdirSync(destDir, { recursive: true });
    const filename = args.byCollection ? baseName : baseName;
    const destPath = resolve(destDir, filename);
    writeFileSync(destPath, imageBuf);
    const relativePath = args.byCollection ? `${slug}/${filename}` : filename;

    const zoomItem = compared?.find((c) => c.key === "zoom");
    const zoomRef = args.quality === "best" ? zoomItem : null;
    const dimLabel = width && height ? `, ${width}x${height}` : "";
    const vsZoom =
      zoomRef?.bytes != null && zoomRef.bytes !== bytes
        ? ` (+${bytes - zoomRef.bytes} vs zoom)`
        : zoomRef?.bytes != null
          ? " (=zoom)"
          : "";
    console.log(`OK → ${relativePath} (${picked.quality}, ${bytes} bytes${dimLabel}${vsZoom})`);

    const item = {
      fabric_number: fabricNumber,
      collection: fabric.collection,
      collection_slug: slug,
      fabric_code: result.fabric_code,
      ok: true,
      filename: relativePath,
      quality: picked.quality,
      url: picked.url,
      bytes,
      width,
      height,
      medias: result.medias,
    };
    if (compared) {
      item.compared = compared;
      if (zoomRef?.bytes != null) {
        item.zoom_bytes = zoomRef.bytes;
        item.zoom_width = zoomRef.width;
        item.zoom_height = zoomRef.height;
        item.bytes_vs_zoom = bytes - zoomRef.bytes;
      }
    }
    const original = originalByFabric.get(fabricNumber);
    if (original) {
      item.original_bytes = original.bytes;
      item.original_quality = original.quality;
      item.bytes_vs_original = bytes - original.bytes;
    }
    manifest.items.push(item);
    if (args.byCollection) bumpCollectionCount(slug, "ok");
    okCount += 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`FAIL (${message})`);
    manifest.items.push({
      fabric_number: fabricNumber,
      collection: fabric.collection,
      collection_slug: slug,
      ok: false,
      error: message,
    });
    if (args.byCollection) bumpCollectionCount(slug, "failed");
    failCount += 1;
  }

  await sleep(args.delayMs);
}

manifest.summary = {
  ok: okCount,
  failed: failCount,
  total: targets.length,
  collection_folders: args.byCollection ? Object.keys(manifest.collections).sort() : undefined,
};
const manifestPath = resolve(args.out, "manifest.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`\nDone: ${okCount} downloaded, ${failCount} failed/skipped`);
if (args.byCollection) {
  const folders = Object.keys(manifest.collections).sort();
  console.log(`Collections: ${folders.length} folder(s) — ${folders.join(", ")}`);
}
console.log(`Manifest: ${manifestPath}`);

process.exit(failCount > 0 && okCount === 0 ? 1 : 0);
