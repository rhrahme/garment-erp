#!/usr/bin/env node
/**
 * Static audit: ERP document reads must not hit a cold Supabase cache on Vercel.
 *
 * Global bootstrap (required for SSR):
 * - src/app/(dashboard)/layout.tsx awaits ensureErpBootstrap() before dashboard SSR
 * - API routes call ensureErpBootstrap() / readJsonFileAsync() in handlers
 *
 * When global bootstrap is present, per-route warmup markers are optional.
 * Without it, API routes / server pages with sync reads must declare warmup.
 *
 * Run: npm run audit:document-loads
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = path.join(ROOT, "src/app/api");
const APP_DIR = path.join(ROOT, "src/app");

const WARMUP_MARKERS = [
  "ensureErpBootstrap",
  "ensureDocumentsLoaded",
  "ensureDocumentForPath",
  "ensureFabricReceivingDocumentsLoaded",
  "ensureFabricOrdersLoaded",
  "ensureShipmentsLoaded",
  "ensureSupplierRepliesLoaded",
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
  "listStoredFabricOrders(",
  "listStoredShipments(",
  "countPendingAwbFabricOrders(",
];

function readText(relativePath) {
  const full = path.join(ROOT, relativePath);
  if (!fs.existsSync(full)) return "";
  return fs.readFileSync(full, "utf8");
}

function hasGlobalBootstrap() {
  const dashboardLayout = readText("src/app/(dashboard)/layout.tsx");
  const rootLayout = readText("src/app/layout.tsx");
  return (
    /await\s+ensureErpBootstrap\s*\(\)/.test(dashboardLayout) ||
    /await\s+ensureErpBootstrap\s*\(\)/.test(rootLayout)
  );
}

function walk(dir, filter) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, filter));
    else if (filter(entry.name, full)) files.push(full);
  }
  return files;
}

function auditServerFiles(label, files) {
  const violations = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);

    const hasRiskyRead = RISKY_READ_MARKERS.some((marker) => source.includes(marker));
    if (!hasRiskyRead) continue;

    const hasWarmup = WARMUP_MARKERS.some((marker) => source.includes(marker));
    if (hasWarmup) continue;

    violations.push(rel);
  }
  return violations;
}

const globalBootstrap = hasGlobalBootstrap();
const apiViolations = auditServerFiles(
  "api",
  walk(API_DIR, (name) => name === "route.ts")
);
const pageViolations = auditServerFiles(
  "pages",
  walk(APP_DIR, (name, full) => name === "page.tsx" && !full.includes(`${path.sep}login${path.sep}`))
);

const violations = globalBootstrap ? [] : [...apiViolations, ...pageViolations];

if (!globalBootstrap) {
  console.error("audit-document-loads: FAIL — missing global ensureErpBootstrap wiring:\n");
  if (!/await\s+ensureErpBootstrap\s*\(\)/.test(readText("src/app/(dashboard)/layout.tsx"))) {
    console.error("  - src/app/(dashboard)/layout.tsx must await ensureErpBootstrap()");
  }
  console.error("");
}

if (violations.length > 0) {
  console.error("audit-document-loads: FAIL — server files with risky sync reads and no warmup:\n");
  for (const file of violations.sort()) {
    console.error(`  - ${file}`);
  }
  console.error(
    "\nFix: await ensureErpBootstrap in root layout, or use async getters / ensureDocumentsLoaded."
  );
  process.exit(1);
}

if (globalBootstrap) {
  console.log(
    "audit-document-loads: OK — ensureErpBootstrap wired globally; sync reads safe after cold-start bootstrap."
  );
} else {
  console.log("audit-document-loads: OK — no risky sync reads without warmup markers.");
}
process.exit(0);
