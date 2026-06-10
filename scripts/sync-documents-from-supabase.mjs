#!/usr/bin/env node
/**
 * Pull all erp_documents from Supabase into local JSON files (dev mirror / git backup).
 *
 * Production on Vercel writes only to Supabase — local files are not updated there.
 * Run this after working on production data to refresh src/data/*.json for local dev:
 *
 *   npm run db:sync-from-supabase
 *   node scripts/sync-documents-from-supabase.mjs
 *   node scripts/sync-documents-from-supabase.mjs --dry-run
 *   node scripts/sync-documents-from-supabase.mjs --only sales_orders,clients
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ERP_DOCUMENT_SPECS = {
  clients: { path: "src/data/clients.json", fallback: { updated_at: null, clients: [] } },
  sales_orders: { path: "src/data/sales-orders.json", fallback: { updated_at: null, orders: [] } },
  fabric_receipts: { path: "src/data/fabric-receipts.json", fallback: { updated_at: null, receipts: [] } },
  fabric_receipts_archive: {
    path: "src/data/fabric-receipts-archive.json",
    fallback: { updated_at: null, receipts: [] },
  },
  production_work_orders: {
    path: "src/data/production-work-orders.json",
    fallback: { updated_at: null, work_orders: [] },
  },
  production_work_orders_archive: {
    path: "src/data/production-work-orders-archive.json",
    fallback: { updated_at: null, work_orders: [] },
  },
  factory_floor_map: {
    path: "src/data/factory-floor-stations.json",
    fallback: { updated_at: null, map_image: null, map_pdf: null, notes: null, stations: [] },
  },
  customer_invoices: { path: "src/data/customer-invoices.json", fallback: { updated_at: null, invoices: [] } },
  supplier_contacts: {
    path: "src/data/suppliers/contacts.json",
    fallback: { updated_at: null, suppliers: [], factory_orders_email: "", inbox_scan_email: "" },
  },
  payroll_employees: { path: "src/data/payroll-employees.json", fallback: { updated_at: null, employees: [] } },
  costing_rates: { path: "src/data/costing-rates.json", fallback: { updated_at: null, rates: [] } },
  fabric_orders: { path: "fabric-orders.local.json", fallback: { orders: [] } },
  shipments: { path: "shipments.local.json", fallback: { shipments: [] } },
  supplier_replies: { path: "supplier-replies.local.json", fallback: { replies: [] } },
  processed_emails: { path: "processed-emails.local.json", fallback: { message_ids: [] } },
  supplier_availability_alerts: {
    path: "supplier-availability-alerts.local.json",
    fallback: { alerts: [] },
  },
  supplier_invoices: { path: "supplier-invoices.local.json", fallback: { invoices: [] } },
  transporter_invoices: { path: "transporter-invoices.local.json", fallback: { invoices: [] } },
  integration_events: { path: "integration-events.local.json", fallback: { events: [] } },
  exchange_rate_state: { path: "exchange-rate-state.local.json", fallback: { last_alert_at: null, last_rate: null } },
};

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

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function parseOnlyFilter(argv) {
  const onlyArg = argv.find((arg) => arg.startsWith("--only"));
  if (!onlyArg) return null;
  const value = onlyArg.includes("=") ? onlyArg.split("=")[1] : argv[argv.indexOf(onlyArg) + 1];
  if (!value) return null;
  return value.split(",").map((key) => key.trim()).filter(Boolean);
}

loadEnvLocal();

const dryRun = process.argv.includes("--dry-run");
const onlyKeys = parseOnlyFilter(process.argv);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY in .env.local"
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const allKeys = Object.keys(ERP_DOCUMENT_SPECS);
  const keys = onlyKeys?.length
    ? onlyKeys.filter((key) => {
        if (key in ERP_DOCUMENT_SPECS) return true;
        console.warn(`Unknown document key "${key}" — skipping.`);
        return false;
      })
    : allKeys;

  if (keys.length === 0) {
    console.error("No document keys to sync.");
    process.exit(1);
  }

  const { data: rows, error } = await admin
    .from("erp_documents")
    .select("id, data, updated_at")
    .in("id", keys);

  if (error) {
    console.error("Cannot read erp_documents:", error.message);
    process.exit(1);
  }

  const byId = new Map((rows ?? []).map((row) => [row.id, row]));
  let written = 0;
  let fallback = 0;
  let totalBytes = 0;

  for (const id of keys) {
    const spec = ERP_DOCUMENT_SPECS[id];
    const remote = byId.get(id);
    const payload = remote?.data ?? spec.fallback;
    const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
    totalBytes += bytes;
    const source = remote ? `Supabase (${remote.updated_at ?? "no timestamp"})` : "local fallback (missing in Supabase)";
    console.log(`  ${id.padEnd(28)} ${formatBytes(bytes).padStart(10)}  ← ${source}`);

    if (!remote) {
      fallback += 1;
      if (!dryRun) continue;
    }

    if (dryRun) continue;

    const fullPath = resolve(process.cwd(), spec.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    written += 1;
  }

  console.log(`\nTotal payload: ${formatBytes(totalBytes)} across ${keys.length} documents`);
  if (dryRun) {
    console.log("\nDry run — no files written.");
    return;
  }
  console.log(`\nDone: ${written} files written, ${fallback} used fallback (not in Supabase).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
