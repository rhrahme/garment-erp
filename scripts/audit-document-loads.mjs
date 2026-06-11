#!/usr/bin/env node
/**
 * Static audit: API routes that read ERP JSON documents must warm the cache first.
 *
 * Safe patterns (any one per route file):
 * - ensureDocumentsLoaded / ensureDocumentForPath / ensureFabricReceivingDocumentsLoaded
 * - loadDocument / readJsonFileAsync
 * - async supplier-contacts getters (readSupplierContacts, getFabricSupplierBrands, …)
 * - lib helpers that already call ensureDocumentsLoaded internally
 *
 * Run: node scripts/audit-document-loads.mjs
 * Exit 1 when risky sync reads are found without a warmup signal.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = path.join(ROOT, "src/app/api");

const WARMUP_MARKERS = [
  "ensureDocumentsLoaded",
  "ensureDocumentForPath",
  "ensureFabricReceivingDocumentsLoaded",
  "ensureFabricOrdersLoaded",
  "ensureErpDocumentsLoaded",
  "loadDocument(",
  "readJsonFileAsync(",
  "readSupplierContacts(",
  "readSupplierContactsAsync(",
  "getFabricSupplierBrands(",
  "getAllSuppliersFromContacts(",
  "getSupplierByIdFromContacts(",
  "readSalesOrdersAsync(",
  "readClientsAsync(",
  "readCustomerInvoicesAsync(",
  "readProductionWorkOrdersAsync(",
  "getFactoryOrdersEmail(",
  "getInboxScanEmailFromContacts(",
  "attachLiveSupplierContacts(",
  "getImportedSuppliers(",
];

const RISKY_READ_MARKERS = [
  "readJsonFile(",
  "readSalesOrders(",
  "readClients(",
  "readCustomerInvoices(",
  "readProductionWorkOrders(",
  "readPayrollEmployees(",
  "readFabricReceipts(",
  "readSupplierContactsSync(",
  "getSupplierByIdFromContactsSync(",
  "getFabricSupplierBrandsSync(",
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.name === "route.ts") files.push(full);
  }
  return files;
}

const violations = [];

for (const file of walk(API_DIR)) {
  const source = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);

  const hasRiskyRead = RISKY_READ_MARKERS.some((marker) => source.includes(marker));
  if (!hasRiskyRead) continue;

  const hasWarmup = WARMUP_MARKERS.some((marker) => source.includes(marker));
  if (hasWarmup) continue;

  violations.push(rel);
}

if (violations.length === 0) {
  console.log("audit-document-loads: OK — no API routes with risky sync document reads without warmup markers.");
  process.exit(0);
}

console.error("audit-document-loads: FAIL — routes may read cold ERP document cache on Vercel:\n");
for (const file of violations.sort()) {
  console.error(`  - ${file}`);
}
console.error(
  "\nFix: use readJsonFileAsync / async data getters, or call ensureDocumentsLoaded([...]) before sync reads."
);
process.exit(1);
