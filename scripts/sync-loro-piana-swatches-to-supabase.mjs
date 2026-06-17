#!/usr/bin/env node
/**
 * Upload Loro Piana swatch JPEGs from data/suppliers/loro-piana/images/ to Supabase storage.
 * Uses manifest.json for the file list (git-tracked); image bytes stay out of git.
 *
 *   node scripts/sync-loro-piana-swatches-to-supabase.mjs
 *   node scripts/sync-loro-piana-swatches-to-supabase.mjs --dry-run
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Bucket: erp-fabric-swatch (see supabase/migrations/010_erp_fabric_swatch_storage.sql).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";

const BUCKET = "erp-fabric-swatch";
const STORAGE_PREFIX = "loro-piana";
const IMAGES_DIR = resolve(process.cwd(), "data/suppliers/loro-piana/images");
const MANIFEST_PATH = join(IMAGES_DIR, "manifest.json");

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function contentTypeForFilename(filename) {
  const ext = extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

loadEnvLocal();

const dryRun = process.argv.includes("--dry-run");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY in .env.local"
  );
  process.exit(1);
}

if (!existsSync(MANIFEST_PATH)) {
  console.error(`Manifest not found: ${MANIFEST_PATH}`);
  console.error("Run: node scripts/import-loro-piana-swatch-images.mjs <source-dir> --collection Australis --weight 270");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const items = (manifest.items ?? []).filter((item) => item.ok && item.filename);

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureBucket() {
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) {
    throw new Error(`Failed to list buckets: ${listError.message}`);
  }
  if (buckets?.some((b) => b.id === BUCKET)) return;

  if (dryRun) {
    console.log(`[dry-run] Would create bucket ${BUCKET}`);
    return;
  }

  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Failed to create bucket ${BUCKET}: ${error.message}`);
  }
}

let uploaded = 0;
let skipped = 0;
let failed = 0;

await ensureBucket();

for (const item of items) {
  const localPath = join(IMAGES_DIR, item.filename);
  const objectPath = `${STORAGE_PREFIX}/${item.filename}`;

  if (!existsSync(localPath)) {
    console.warn(`Skip (missing local file): ${item.filename}`);
    skipped += 1;
    continue;
  }

  const body = readFileSync(localPath);
  const contentType = contentTypeForFilename(item.filename);

  if (dryRun) {
    console.log(`[dry-run] Would upload ${objectPath} (${body.length} bytes)`);
    uploaded += 1;
    continue;
  }

  const { error } = await admin.storage.from(BUCKET).upload(objectPath, body, {
    contentType,
    upsert: true,
  });

  if (error) {
    console.error(`Failed ${objectPath}: ${error.message}`);
    failed += 1;
    continue;
  }

  uploaded += 1;
  const size = statSync(localPath).size;
  console.log(`Uploaded ${objectPath} (${size} bytes)`);
}

console.log(`Done. uploaded=${uploaded} skipped=${skipped} failed=${failed} (catalog items=${items.length})`);
if (failed > 0) process.exit(1);
