#!/usr/bin/env node
/**
 * Upload Caccioppoli swatch JPEGs from data/suppliers/caccioppoli/images/ to Supabase storage.
 * Uses manifest.json for the file list (git-tracked); image bytes stay out of git.
 *
 *   node scripts/sync-caccioppoli-swatches-to-supabase.mjs
 *   node scripts/sync-caccioppoli-swatches-to-supabase.mjs --dry-run
 *   node scripts/sync-caccioppoli-swatches-to-supabase.mjs --missing-only
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Bucket: erp-fabric-swatch/caccioppoli/
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";

const BUCKET = "erp-fabric-swatch";
const STORAGE_PREFIX = "caccioppoli";
const IMAGES_DIR = resolve(process.cwd(), "data/suppliers/caccioppoli/images");
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

const MAX_UPLOAD_RETRIES = 5;
const RETRY_BASE_MS = 1000;

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function isRetryableError(message) {
  return /fetch failed|network|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|503|502|504|429/i.test(
    message
  );
}

loadEnvLocal();

const dryRun = process.argv.includes("--dry-run");
const missingOnly = process.argv.includes("--missing-only");
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
  console.error("Run: node scripts/download-caccioppoli-fabric-images.mjs --all");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const items = (manifest.items ?? []).filter((item) => item.ok && item.filename);

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureBucket() {
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) throw new Error(`Failed to list buckets: ${listError.message}`);
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

/** @type {Set<string>} */
const existingObjects = new Set();
if (missingOnly) {
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await admin.storage.from(BUCKET).list(STORAGE_PREFIX, {
      limit,
      offset,
    });
    if (error) throw new Error(`Failed to list ${STORAGE_PREFIX}/: ${error.message}`);
    if (!data?.length) break;
    for (const entry of data) {
      if (entry.name) existingObjects.add(`${STORAGE_PREFIX}/${entry.name}`);
    }
    if (data.length < limit) break;
    offset += limit;
  }
  console.log(`Found ${existingObjects.size} existing object(s) under ${STORAGE_PREFIX}/`);
}

async function uploadWithRetry(objectPath, body, contentType) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt += 1) {
    const { error } = await admin.storage.from(BUCKET).upload(objectPath, body, {
      contentType,
      upsert: true,
    });
    if (!error) return null;
    lastError = error;
    if (!isRetryableError(error.message) || attempt === MAX_UPLOAD_RETRIES) return error;
    const delayMs = RETRY_BASE_MS * 2 ** (attempt - 1);
    console.warn(
      `Retry ${attempt}/${MAX_UPLOAD_RETRIES} for ${objectPath}: ${error.message} (wait ${delayMs}ms)`
    );
    await sleep(delayMs);
  }
  return lastError;
}

for (const item of items) {
  const basename = item.filename.includes("/") ? item.filename.split("/").pop() : item.filename;
  const localPath = join(IMAGES_DIR, item.filename);
  const objectPath = `${STORAGE_PREFIX}/${basename}`;

  if (!existsSync(localPath)) {
    console.warn(`Skip (missing local file): ${item.filename}`);
    skipped += 1;
    continue;
  }

  if (missingOnly && existingObjects.has(objectPath)) {
    skipped += 1;
    continue;
  }

  const body = readFileSync(localPath);
  const contentType = contentTypeForFilename(basename);

  if (dryRun) {
    console.log(`[dry-run] Would upload ${objectPath} (${body.length} bytes)`);
    uploaded += 1;
    continue;
  }

  const error = await uploadWithRetry(objectPath, body, contentType);
  if (error) {
    console.error(`Failed ${objectPath}: ${error.message}`);
    failed += 1;
    continue;
  }

  uploaded += 1;
  const size = statSync(localPath).size;
  console.log(`Uploaded ${objectPath} (${size} bytes)`);
}

console.log(
  `Done. uploaded=${uploaded} skipped=${skipped} failed=${failed} (catalog items=${items.length})`
);
if (failed > 0) process.exit(1);
