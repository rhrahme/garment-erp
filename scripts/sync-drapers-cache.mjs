#!/usr/bin/env node
/**
 * Refresh the full Drapers cache: specs → swatch images → link manifest.
 *
 * Specs + remote swatch URLs are written to src/data/suppliers/drapers-hs-ss26.json.
 * JPEGs are saved under data/suppliers/drapers/images/ (gitignored; manifest.json tracked).
 * Live API is only used during this admin refresh — UI reads the cache.
 *
 * Usage:
 *   node scripts/sync-drapers-cache.mjs                    # full catalog (specs + all images)
 *   node scripts/sync-drapers-cache.mjs --open-orders      # open SO fabrics first (faster)
 *   node scripts/sync-drapers-cache.mjs --enrich-all       # same as default (full catalog specs)
 *   node scripts/sync-drapers-cache.mjs --skip-images
 *   node scripts/sync-drapers-cache.mjs --skip-specs
 *   node scripts/sync-drapers-cache.mjs --availability     # also refresh live stock meters
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const NODE = process.execPath;
const LOADER = "./scripts/tsconfig-paths-loader.mjs";

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

function nodeArgs(extra) {
  return ["--experimental-strip-types", "--experimental-loader", LOADER, ...extra];
}

async function main() {
  loadEnvLocal();

  const args = process.argv.slice(2);
  const openOrders = args.includes("--open-orders");
  const enrichAll = args.includes("--enrich-all") || (!openOrders && !args.includes("--codes"));
  const skipSpecs = args.includes("--skip-specs");
  const skipImages = args.includes("--skip-images");
  const includeAvailability = args.includes("--availability");
  const codesArg =
    args.find((a) => a.startsWith("--codes="))?.slice("--codes=".length) ??
    (args.includes("--codes") ? args[args.indexOf("--codes") + 1] : null);
  const delayMs = Number.parseInt(
    args.find((a) => a.startsWith("--delay-ms="))?.slice("--delay-ms=".length) ??
      (args.includes("--delay-ms") ? args[args.indexOf("--delay-ms") + 1] : "150"),
    10
  );

  const { drapersFabricNumbersFromOpenOrders, syncDrapersCatalogFromApi } = await import(
    "../src/lib/integrations/drapers/sync-catalog-enrichment.ts"
  );

  let fabric_numbers;
  if (codesArg) {
    fabric_numbers = codesArg.split(/[,\s]+/).filter(Boolean);
  } else if (openOrders) {
    fabric_numbers = drapersFabricNumbersFromOpenOrders();
  }

  const summary = {
    mode: openOrders ? "open-orders" : enrichAll ? "enrich-all" : "codes",
    fabric_targets: fabric_numbers?.length ?? 0,
    specs: null,
    images: null,
    link: null,
  };

  if (!skipSpecs) {
    console.log("\n=== Drapers specs cache (list + detail + prices) ===\n");
    summary.specs = await syncDrapersCatalogFromApi({
      fabric_numbers,
      enrich_all: enrichAll && !fabric_numbers?.length,
      enrich_details: enrichAll || Boolean(fabric_numbers?.length),
      include_availability: includeAvailability,
      include_prices: true,
      delay_ms: delayMs,
    });
    console.log(JSON.stringify(summary.specs, null, 2));
  }

  if (!skipImages) {
    console.log("\n=== Drapers swatch image download ===\n");
    const imageArgs = [
      "scripts/download-drapers-fabric-images.mjs",
      "--best",
      "--out",
      "data/suppliers/drapers/images",
      "--delay-ms",
      String(delayMs),
    ];
    if (openOrders && fabric_numbers?.length) {
      imageArgs.push("--codes", fabric_numbers.join(","));
    } else if (enrichAll) {
      imageArgs.push("--all");
    } else if (fabric_numbers?.length) {
      imageArgs.push("--codes", fabric_numbers.join(","));
    } else {
      imageArgs.push("--all");
    }

    const imageRun = spawnSync(NODE, imageArgs, { cwd: ROOT, stdio: "inherit", env: process.env });
    summary.images = { exit_code: imageRun.status ?? 1 };
    if (imageRun.status !== 0) {
      console.warn("Image download finished with errors — linking manifest anyway.");
    }

    console.log("\n=== Link manifest → catalog JSON ===\n");
    const { linkDrapersSwatchManifestToCatalog } = await import(
      "../src/lib/integrations/drapers/link-swatch-manifest.ts"
    );
    summary.link = linkDrapersSwatchManifestToCatalog();
    console.log(JSON.stringify(summary.link, null, 2));
  }

  console.log("\n=== Drapers cache refresh complete ===\n");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
