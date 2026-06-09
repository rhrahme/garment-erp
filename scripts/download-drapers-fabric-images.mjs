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
 *   node scripts/download-drapers-fabric-images.mjs --codes 10101,90640,85119
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, extname } from "node:path";

const ROOT = process.cwd();
const CATALOG_PATH = resolve(ROOT, "src/data/suppliers/drapers-hs-ss26.json");
const DEFAULT_OUT = resolve(ROOT, "data/suppliers/drapers/images");
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
  const args = { limit: 10, quality: "zoom", out: DEFAULT_OUT, codes: null, delayMs: 200 };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit" && argv[i + 1]) args.limit = Number.parseInt(argv[++i], 10);
    else if (arg === "--quality" && argv[i + 1]) args.quality = argv[++i];
    else if (arg === "--out" && argv[i + 1]) args.out = resolve(ROOT, argv[++i]);
    else if (arg === "--codes" && argv[i + 1]) args.codes = argv[++i].split(/[,\s]+/).filter(Boolean);
    else if (arg === "--delay-ms" && argv[i + 1]) args.delayMs = Number.parseInt(argv[++i], 10);
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/download-drapers-fabric-images.mjs [options]

Options:
  --limit N       Max fabrics to download (default: 10)
  --quality TYPE  square | zoom | ruler (default: zoom — highest practical swatch)
  --out DIR       Output directory (default: data/suppliers/drapers/images)
  --codes A,B,C   Specific fabric numbers instead of catalog order
  --delay-ms N    Pause between API calls (default: 200)
`);
      process.exit(0);
    }
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

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  return buf.length;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadFabricNumbers(codesArg) {
  if (codesArg?.length) return codesArg;
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  return (catalog.fabrics ?? []).map((f) => String(f.fabric_number)).filter(Boolean);
}

loadEnvLocal();
const args = parseArgs(process.argv);

if (!existsSync(CATALOG_PATH) && !args.codes) {
  console.error(`Catalog not found: ${CATALOG_PATH}`);
  process.exit(1);
}

mkdirSync(args.out, { recursive: true });

const allNumbers = loadFabricNumbers(args.codes);
const targets = allNumbers.slice(0, args.limit);

console.log(`Drapers fabric image download`);
console.log(`  Catalog: ${CATALOG_PATH} (${allNumbers.length} fabrics)`);
console.log(`  Output:  ${args.out}`);
console.log(`  Quality: ${args.quality}`);
console.log(`  Limit:   ${targets.length} fabric(s)\n`);

const manifest = {
  downloaded_at: new Date().toISOString(),
  source: "Drapers API GET /fabrics/{code}/medias/",
  catalog_path: "src/data/suppliers/drapers-hs-ss26.json",
  quality_requested: args.quality,
  items: [],
};

let okCount = 0;
let failCount = 0;

for (const fabricNumber of targets) {
  process.stdout.write(`${fabricNumber} ... `);
  try {
    const result = await lookupMedias(fabricNumber);
    if (!result.ok) {
      console.log(`SKIP (${result.error})`);
      manifest.items.push({ fabric_number: fabricNumber, ok: false, error: result.error });
      failCount += 1;
      await sleep(args.delayMs);
      continue;
    }

    const picked = pickImageUrl(result.medias, args.quality);
    if (!picked) {
      console.log("SKIP (no image URL)");
      manifest.items.push({ fabric_number: fabricNumber, ok: false, error: "no image URL" });
      failCount += 1;
      await sleep(args.delayMs);
      continue;
    }

    const ext = extFromUrl(picked.url);
    const filename = `${normalizeCode(fabricNumber)}${ext}`;
    const destPath = resolve(args.out, filename);
    const bytes = await downloadImage(picked.url, destPath);

    console.log(`OK → ${filename} (${picked.quality}, ${bytes} bytes)`);
    manifest.items.push({
      fabric_number: fabricNumber,
      fabric_code: result.fabric_code,
      ok: true,
      filename,
      quality: picked.quality,
      url: picked.url,
      bytes,
      medias: result.medias,
    });
    okCount += 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`FAIL (${message})`);
    manifest.items.push({ fabric_number: fabricNumber, ok: false, error: message });
    failCount += 1;
  }

  await sleep(args.delayMs);
}

manifest.summary = { ok: okCount, failed: failCount, total: targets.length };
const manifestPath = resolve(args.out, "manifest.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`\nDone: ${okCount} downloaded, ${failCount} failed/skipped`);
console.log(`Manifest: ${manifestPath}`);

process.exit(failCount > 0 && okCount === 0 ? 1 : 0);
