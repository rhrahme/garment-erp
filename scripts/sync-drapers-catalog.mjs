#!/usr/bin/env node
/**
 * Sync Drapers catalog from official API into src/data/suppliers/drapers-hs-ss26.json
 *
 * Bulk (always): GET /fabrics/, /stock/, /pricelist/account/
 * Detail + medias (optional): GET /fabrics/{code}/, /fabrics/{code}/medias/
 *
 * Usage:
 *   node scripts/sync-drapers-catalog.mjs --open-orders
 *   node scripts/sync-drapers-catalog.mjs --bulk
 *   node scripts/sync-drapers-catalog.mjs --codes 10101,90640
 *   node scripts/sync-drapers-catalog.mjs --enrich-all --delay-ms 200
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

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

async function main() {
  loadEnvLocal();

  const { syncDrapersCatalogFromApi, drapersFabricNumbersFromOpenOrders } = await import(
    "../src/lib/integrations/drapers/sync-catalog-enrichment.ts"
  );

  const args = process.argv.slice(2);
  const openOrders = args.includes("--open-orders") || (!args.includes("--bulk") && !args.includes("--codes") && !args.includes("--enrich-all"));
  const bulkOnly = args.includes("--bulk");
  const enrichAll = args.includes("--enrich-all");
  const codesArg = args.find((a) => a.startsWith("--codes="))?.slice("--codes=".length)
    ?? (args.includes("--codes") ? args[args.indexOf("--codes") + 1] : null);
  const delayMs = Number.parseInt(
    args.find((a) => a.startsWith("--delay-ms="))?.slice("--delay-ms=".length)
      ?? (args.includes("--delay-ms") ? args[args.indexOf("--delay-ms") + 1] : "150"),
    10
  );

  let fabric_numbers;
  if (codesArg) {
    fabric_numbers = codesArg.split(/[,\s]+/).filter(Boolean);
  } else if (openOrders) {
    fabric_numbers = drapersFabricNumbersFromOpenOrders();
  } else if (enrichAll) {
    const catalog = JSON.parse(readFileSync(resolve(ROOT, "src/data/suppliers/drapers-hs-ss26.json"), "utf8"));
    fabric_numbers = catalog.fabrics.map((f) => f.fabric_number);
  }

  const result = await syncDrapersCatalogFromApi({
    fabric_numbers,
    enrich_details: Boolean(fabric_numbers?.length) && !bulkOnly,
    delay_ms: delayMs,
  });

  console.log(
    JSON.stringify(
      {
        mode: bulkOnly ? "bulk" : enrichAll ? "enrich-all" : openOrders ? "open-orders" : "codes",
        fabric_targets: fabric_numbers?.length ?? 0,
        ...result,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
