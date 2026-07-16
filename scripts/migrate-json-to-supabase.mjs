#!/usr/bin/env node
/**
 * One-time import: upload all local JSON ERP documents to Supabase erp_documents.
 *
 * supplier_contacts merges with existing Supabase data (never drops remote-only suppliers).
 * Upload is refused if required fabric supplier IDs would be missing after merge.
 *
 * Prerequisites:
 *   1. Run supabase/migrations/006_erp_documents.sql in Supabase SQL editor (or supabase db push)
 *   2. Set SUPABASE_SERVICE_ROLE_KEY in .env.local (Settings → API → secret key)
 *
 * Usage:
 *   node scripts/migrate-json-to-supabase.mjs
 *   node scripts/migrate-json-to-supabase.mjs --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  mergeIncomingWithRemoteSupplierContacts,
  validateSupplierContacts,
} from "./lib/supplier-contacts-guard.mjs";

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
  custom_fabrics: { path: "src/data/custom-fabrics.json", fallback: { updated_at: null, fabrics: [] } },
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

function readLocalJson(relativePath, fallback) {
  const fullPath = resolve(process.cwd(), relativePath);
  if (!existsSync(fullPath)) return { data: fallback, bytes: 0, source: "fallback" };
  const raw = readFileSync(fullPath, "utf8");
  return { data: JSON.parse(raw), bytes: Buffer.byteLength(raw, "utf8"), source: fullPath };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Full-blob docs edited on production — skip when Supabase is newer than local unless --force. */
const PRODUCTION_EDITABLE_KEYS = new Set(["customer_invoices", "sales_orders"]);

loadEnvLocal();

const dryRun = process.argv.includes("--dry-run");
const forceUpload = process.argv.includes("--force");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();

function listLocalDocuments() {
  let totalBytes = 0;
  for (const [id, spec] of Object.entries(ERP_DOCUMENT_SPECS)) {
    const { bytes, source } = readLocalJson(spec.path, spec.fallback);
    totalBytes += bytes;
    console.log(`  ${id.padEnd(28)} ${formatBytes(bytes).padStart(10)}  ← ${source}`);
  }
  console.log(`\nTotal payload: ${formatBytes(totalBytes)} across ${Object.keys(ERP_DOCUMENT_SPECS).length} documents`);
}

if (dryRun && (!url || !serviceKey)) {
  console.log("Dry run — local files only (no Supabase credentials):\n");
  listLocalDocuments();
  process.exit(0);
}

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY in .env.local"
  );
  console.error("Get the secret key from Supabase → Project Settings → API → secret key");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { error: probeError } = await admin.from("erp_documents").select("id").limit(1);
  if (probeError) {
    console.error("Cannot read erp_documents table:", probeError.message);
    console.error("\nRun this SQL first (Supabase → SQL Editor):");
    console.error("  supabase/migrations/006_erp_documents.sql\n");
    process.exit(1);
  }

  let totalBytes = 0;
  const rows = [];

  for (const [id, spec] of Object.entries(ERP_DOCUMENT_SPECS)) {
    const { data, bytes, source } = readLocalJson(spec.path, spec.fallback);
    totalBytes += bytes;
    rows.push({ id, data, bytes, source });
    console.log(`  ${id.padEnd(28)} ${formatBytes(bytes).padStart(10)}  ← ${source}`);
  }

  console.log(`\nTotal payload: ${formatBytes(totalBytes)} across ${rows.length} documents`);

  if (dryRun) {
    console.log("\nDry run — no data written.");
    return;
  }

  const updated_at = new Date().toISOString();
  let ok = 0;
  let failed = 0;
  let skipped = 0;

  const { data: remoteRows } = await admin
    .from("erp_documents")
    .select("id, data, updated_at")
    .in("id", rows.map((row) => row.id));
  const remoteById = new Map((remoteRows ?? []).map((row) => [row.id, row]));
  const remoteContacts = remoteById.get("supplier_contacts")?.data ?? null;

  for (const row of rows) {
    let dataToUpload = row.data;

    if (PRODUCTION_EDITABLE_KEYS.has(row.id) && !forceUpload) {
      const remote = remoteById.get(row.id);
      const localStamp = row.data?.updated_at ? Date.parse(row.data.updated_at) : NaN;
      const remoteStamp = remote?.updated_at ? Date.parse(remote.updated_at) : NaN;
      if (remote && Number.isFinite(remoteStamp) && (!Number.isFinite(localStamp) || remoteStamp > localStamp)) {
        console.warn(
          `⚠ ${row.id}: skipping — Supabase (${remote.updated_at}) is newer than local ` +
            `(${row.data?.updated_at ?? "no timestamp"}). Use --force to overwrite production edits.`
        );
        skipped += 1;
        continue;
      }
    }

    if (row.id === "supplier_contacts") {
      dataToUpload = mergeIncomingWithRemoteSupplierContacts(row.data, remoteContacts);
      try {
        validateSupplierContacts(dataToUpload, { throwOnMissing: true });
      } catch (error) {
        console.error(`✗ supplier_contacts: ${error.message}`);
        console.error("  Refusing upload — would drop required fabric suppliers.");
        failed += 1;
        continue;
      }
    }

    const { error } = await admin.from("erp_documents").upsert(
      { id: row.id, data: dataToUpload, updated_at },
      { onConflict: "id" }
    );
    if (error) {
      console.error(`✗ ${row.id}: ${error.message}`);
      failed += 1;
    } else {
      console.log(`✓ ${row.id}`);
      ok += 1;
    }
  }

  console.log(`\nDone: ${ok} uploaded, ${skipped} skipped (newer on Supabase), ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
