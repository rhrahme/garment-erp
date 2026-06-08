#!/usr/bin/env node
/**
 * Seed Canclini linen warehouse stock into Supabase materials + inventory.
 *
 * Prerequisites:
 *   1. Run supabase/migrations/007_warehouse_inventory.sql in Supabase SQL Editor
 *   2. Set SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage:
 *   node --experimental-strip-types --import ./scripts/tsconfig-paths-loader.mjs scripts/seed-canclini-inventory.mjs
 *   node --experimental-strip-types --import ./scripts/tsconfig-paths-loader.mjs scripts/seed-canclini-inventory.mjs --dry-run
 *   node --experimental-strip-types --import ./scripts/tsconfig-paths-loader.mjs scripts/seed-canclini-inventory.mjs --force
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
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

loadEnvLocal();

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

const { createAdminClient, seedCancliniInventory } = await import(
  "../src/lib/data/seed-canclini-inventory.ts"
);

const admin = createAdminClient();
if (!admin) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY in .env.local"
  );
  process.exit(1);
}

const result = await seedCancliniInventory(admin, { dryRun, force });

console.log(`Catalog: ${result.catalogCount} Canclini linen codes`);
if (result.withMeters === 0) {
  console.log("Note: available_meters is null for all fabrics — quantity_on_hand seeded as 0.");
} else {
  console.log(`${result.withMeters} fabrics have available_meters set.`);
}

if (result.reason?.includes("Missing warehouse tables")) {
  console.error(`\n✗ ${result.reason}`);
  process.exit(1);
}

if (dryRun) {
  console.log("\nDry run — no data written.");
  process.exit(0);
}

if (result.skipped) {
  console.log(`\n✓ ${result.reason}`);
  process.exit(0);
}

console.log("\nDone:");
console.log(`  materials upserted: ${result.materialsUpserted}`);
console.log(`  inventory rows:   ${result.inventoryRows}`);
console.log(`  total Canclini materials in DB: ${result.totalCancliniMaterials ?? result.materialsUpserted}`);

if (!result.ok) process.exit(1);
