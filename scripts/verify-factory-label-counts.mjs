#!/usr/bin/env node
/**
 * Guards factory label count mapping and resolveFabricLineLabelCount.
 *
 * Usage: npm run verify:label-counts
 */
import { register } from "node:module";
import path from "path";
import { pathToFileURL } from "url";

const ROOT = process.cwd();
register(pathToFileURL(path.join(ROOT, "scripts/clickup-import-loader.mjs")).href, import.meta.url);

const garmentTypes = await import(
  pathToFileURL(path.join(ROOT, "src/lib/sales-orders/garment-types.ts")).href
);
const labelDisplay = await import(
  pathToFileURL(path.join(ROOT, "src/lib/sales-orders/label-display.ts")).href
);

const {
  GARMENT_LABEL_COUNTS,
  GARMENT_STITCH_TYPES,
  getLabelCountForGarment,
} = garmentTypes;
const { resolveFabricLineLabelCount } = labelDisplay;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`ok: ${message}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label}: expected ${expected}, got ${actual}`);
  }
}

for (const garmentType of GARMENT_STITCH_TYPES) {
  assertEqual(
    getLabelCountForGarment(garmentType),
    GARMENT_LABEL_COUNTS[garmentType],
    `getLabelCountForGarment(${garmentType})`
  );
}

assertEqual(getLabelCountForGarment("Trouser"), 1, "Trouser label count");
assertEqual(getLabelCountForGarment("Suit"), 2, "Suit label count");
assertEqual(getLabelCountForGarment("Shirt+Trouser+Short"), 3, "Shirt+Trouser+Short label count");
assertEqual(getLabelCountForGarment("Fabric only"), 0, "Fabric only label count");
assertEqual(getLabelCountForGarment("Unknown garment"), 1, "Unknown garment fallback");

assertEqual(
  resolveFabricLineLabelCount({ garment_type: "Suit", label_count: 2, label_stickers: null }),
  2,
  "resolveFabricLineLabelCount uses stored label_count"
);

assertEqual(
  resolveFabricLineLabelCount({
    garment_type: "Suit",
    label_count: null,
    label_stickers: [{ piece_name: "Jacket" }, { piece_name: "Trouser" }],
  }),
  2,
  "resolveFabricLineLabelCount prefers sticker count"
);

assertEqual(
  resolveFabricLineLabelCount({ garment_type: "Trouser", label_count: null, label_stickers: null }),
  1,
  "resolveFabricLineLabelCount falls back to garment default"
);

function addLineLabelCount(garmentType) {
  return getLabelCountForGarment(garmentType);
}

assertEqual(addLineLabelCount("Suit"), 2, "addLine label_count for Suit");
assertEqual(addLineLabelCount("Trouser"), 1, "addLine label_count for Trouser");

pass("factory label count mapping and resolver checks passed");
