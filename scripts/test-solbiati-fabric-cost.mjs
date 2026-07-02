#!/usr/bin/env node
/**
 * Simulate getFabricCostSummary for SO-2026-0116 fabric lines.
 * Run: node --experimental-strip-types --import ./scripts/tsconfig-paths-loader.mjs scripts/test-solbiati-fabric-cost.mjs
 */

import { readFileSync } from "fs";
import {
  fabricLineEffectiveUnitPrice,
  formatFabricCostHint,
  formatFabricCostSummary,
  getFabricCostSummary,
} from "../src/lib/sales-orders/fabric-cost.ts";
import { resolveFabricItemFromCatalog } from "../src/lib/fabric-sourcing/resolve-fabric-from-catalog.ts";
import { searchSupplierFabrics } from "../src/lib/data/supplier-catalogs.ts";

const data = JSON.parse(readFileSync("src/data/sales-orders.json", "utf8"));
const order = data.orders.find((o) => o.so_number === "SO-2026-0116");
if (!order) {
  console.error("SO-2026-0116 not found in sales-orders.json");
  process.exit(1);
}

console.log("Order:", order.id, order.so_number);
console.log("Lines:", order.fabric_lines.length);

const sample = order.fabric_lines[0];
console.log("\nSample line:", {
  fabric_number: sample.fabric_number,
  supplier_id: sample.supplier_id,
  supplier_name: sample.supplier_name,
  unit_price: sample.unit_price,
  quantity: sample.quantity,
});

const catalog = resolveFabricItemFromCatalog(sample.supplier_id, sample.fabric_number);
console.log("resolveFabricItemFromCatalog:", {
  unit_price: catalog.unit_price,
  manual: catalog.manual,
  supplier_id: catalog.supplier_id,
});

console.log("solbiati catalog count:", searchSupplierFabrics("solbiati", "S10005", 1).length);
console.log("loro-piana catalog S10005:", searchSupplierFabrics("loro-piana", "S10005", 1).length);

const summary = getFabricCostSummary(order.fabric_lines);
console.log("\nFabric cost summary:", summary);
console.log("Formatted:", formatFabricCostSummary(summary));
console.log("Hint:", formatFabricCostHint(summary));

const unpriced = order.fabric_lines.filter((line) => fabricLineEffectiveUnitPrice(line) == null);
if (unpriced.length > 0) {
  console.log("\nUnpriced lines:", unpriced.length);
  console.log("First unpriced:", unpriced[0].fabric_number, unpriced[0].supplier_id);
}
