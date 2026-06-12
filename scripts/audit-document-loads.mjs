#!/usr/bin/env node
/**
 * Static audit: ERP document reads must not hit a cold Supabase cache on Vercel.
 *
 * Dashboard bootstrap (required for SSR pages):
 * - src/app/(dashboard)/layout.tsx awaits ensureErpBootstrap() with fail-open try/catch
 * - Root layout must NOT duplicate bootstrap (blocks /login when Supabase is slow)
 *
 * API routes call ensureErpBootstrap() / ensureDocumentsLoaded() / readJsonFileAsync().
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

function hasDashboardBootstrap() {
  const dashboardLayout = readText("src/app/(dashboard)/layout.tsx");
  return /ensureErpBootstrap\s*\(\)/.test(dashboardLayout);
}

function hasRootBootstrapConflict() {
  const rootLayout = readText("src/app/layout.tsx");
  return /ensureErpBootstrap\s*\(\)/.test(rootLayout);
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

function auditServerFiles(files) {
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

const dashboardBootstrap = hasDashboardBootstrap();
const rootConflict = hasRootBootstrapConflict();
const apiViolations = auditServerFiles(walk(API_DIR, (name) => name === "route.ts"));
const pageViolations = auditServerFiles(
  walk(APP_DIR, (name, full) => name === "page.tsx" && !full.includes(`${path.sep}login${path.sep}`))
);

let failed = false;

if (rootConflict) {
  failed = true;
  console.error("audit-document-loads: FAIL — remove ensureErpBootstrap from src/app/layout.tsx");
  console.error("  Bootstrap belongs in src/app/(dashboard)/layout.tsx only (keeps /login fast).\n");
}

if (!dashboardBootstrap) {
  failed = true;
  console.error("audit-document-loads: FAIL — missing dashboard ensureErpBootstrap wiring:\n");
  console.error("  - src/app/(dashboard)/layout.tsx must await ensureErpBootstrap() with fail-open try/catch");
  console.error("");
}

const violations = [...apiViolations, ...pageViolations];
if (violations.length > 0) {
  failed = true;
  console.error("audit-document-loads: FAIL — server files with risky sync reads and no warmup:\n");
  for (const file of violations.sort()) {
    console.error(`  - ${file}`);
  }
  console.error(
    "\nFix: await ensureDocumentsLoaded / readJsonFileAsync in handlers, or ensureErpBootstrap in dashboard layout."
  );
}

if (failed) {
  process.exit(1);
}

console.log(
  "audit-document-loads: OK — dashboard bootstrap wired; root layout clean; sync reads have warmup markers."
);
process.exit(0);
