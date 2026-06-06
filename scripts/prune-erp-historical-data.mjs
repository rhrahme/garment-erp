#!/usr/bin/env node
/**
 * Shrink hot-path ERP documents by moving historical rows to archive files.
 * Speeds up Supabase downloads (fabric_receipts, production_work_orders).
 *
 * Usage:
 *   node scripts/prune-erp-historical-data.mjs
 *   node scripts/prune-erp-historical-data.mjs --dry-run
 *   node scripts/prune-erp-historical-data.mjs --sync-supabase
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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

function readJson(relPath, fallback) {
  const full = resolve(process.cwd(), relPath);
  if (!existsSync(full)) return { data: structuredClone(fallback), bytes: 0, path: full };
  const raw = readFileSync(full, "utf8");
  return { data: JSON.parse(raw), bytes: Buffer.byteLength(raw, "utf8"), path: full };
}

function writeJson(fullPath, data) {
  writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return Buffer.byteLength(JSON.stringify(data), "utf8");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function syncToSupabase(rows) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("  (skip Supabase — credentials missing)");
    return false;
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const updated_at = new Date().toISOString();
  let ok = 0;

  for (const row of rows) {
    const { error } = await admin.from("erp_documents").upsert(
      { id: row.id, data: row.data, updated_at },
      { onConflict: "id" }
    );
    if (error) {
      console.error(`  ✗ ${row.id}: ${error.message}`);
    } else {
      console.log(`  ✓ synced ${row.id} (${formatBytes(row.bytes)})`);
      ok += 1;
    }
  }

  return ok === rows.length;
}

function pruneFabricReceipts(now) {
  const activePath = "src/data/fabric-receipts.json";
  const archivePath = "src/data/fabric-receipts-archive.json";
  const empty = { updated_at: null, receipts: [] };

  const active = readJson(activePath, empty);
  const archive = readJson(archivePath, empty);

  const keep = [];
  const move = [];

  for (const receipt of active.data.receipts) {
    if (receipt.status === "handed_off") move.push(receipt);
    else keep.push(receipt);
  }

  const archiveIds = new Set(archive.data.receipts.map((item) => item.id));
  for (const receipt of move) {
    if (!archiveIds.has(receipt.id)) {
      archive.data.receipts.push(receipt);
      archiveIds.add(receipt.id);
    }
  }

  active.data.receipts = keep;
  active.data.updated_at = now;
  archive.data.updated_at = now;

  return {
    active,
    archive,
    moved: move.length,
    activeAfter: keep.length,
    archiveAfter: archive.data.receipts.length,
  };
}

function pruneProductionWorkOrders(now) {
  const activePath = "src/data/production-work-orders.json";
  const archivePath = "src/data/production-work-orders-archive.json";
  const empty = { updated_at: null, work_orders: [] };

  const active = readJson(activePath, empty);
  const archive = readJson(archivePath, empty);

  const keep = [];
  const move = [];

  for (const order of active.data.work_orders) {
    if (order.status === "completed") move.push(order);
    else keep.push(order);
  }

  const archiveIds = new Set(archive.data.work_orders.map((item) => item.id));
  for (const order of move) {
    if (!archiveIds.has(order.id)) {
      archive.data.work_orders.push(order);
      archiveIds.add(order.id);
    }
  }

  active.data.work_orders = keep;
  active.data.updated_at = now;
  archive.data.updated_at = now;

  return {
    active,
    archive,
    moved: move.length,
    activeAfter: keep.length,
    archiveAfter: archive.data.work_orders.length,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const syncSupabase = process.argv.includes("--sync-supabase") || !dryRun;
  loadEnvLocal();

  const now = new Date().toISOString();
  const receipts = pruneFabricReceipts(now);
  const workOrders = pruneProductionWorkOrders(now);

  console.log("Prune ERP historical data\n");

  console.log("Fabric receipts");
  console.log(`  Before: ${receipts.active.data.receipts.length + receipts.moved} active file (${formatBytes(receipts.active.bytes)})`);
  console.log(`  Move to archive: ${receipts.moved}`);
  console.log(`  After active:    ${receipts.activeAfter}`);
  console.log(`  Archive total:   ${receipts.archiveAfter}`);

  console.log("\nProduction work orders");
  console.log(
    `  Before: ${workOrders.active.data.work_orders.length + workOrders.moved} active file (${formatBytes(workOrders.active.bytes)})`
  );
  console.log(`  Move to archive: ${workOrders.moved}`);
  console.log(`  After active:    ${workOrders.activeAfter}`);
  console.log(`  Archive total:   ${workOrders.archiveAfter}`);

  if (dryRun) {
    console.log("\nDry run — no files written.");
    return;
  }

  const activeReceiptBytes = writeJson(receipts.active.path, receipts.active.data);
  const archiveReceiptBytes = writeJson(receipts.archive.path, receipts.archive.data);
  const activeWorkBytes = writeJson(workOrders.active.path, workOrders.active.data);
  const archiveWorkBytes = writeJson(workOrders.archive.path, workOrders.archive.data);

  console.log("\nWrote local JSON:");
  console.log(`  fabric-receipts.json              ${formatBytes(activeReceiptBytes)}`);
  console.log(`  fabric-receipts-archive.json    ${formatBytes(archiveReceiptBytes)}`);
  console.log(`  production-work-orders.json       ${formatBytes(activeWorkBytes)}`);
  console.log(`  production-work-orders-archive.json ${formatBytes(archiveWorkBytes)}`);

  if (syncSupabase) {
    console.log("\nSyncing to Supabase…");
    await syncToSupabase([
      { id: "fabric_receipts", data: receipts.active.data, bytes: activeReceiptBytes },
      { id: "fabric_receipts_archive", data: receipts.archive.data, bytes: archiveReceiptBytes },
      { id: "production_work_orders", data: workOrders.active.data, bytes: activeWorkBytes },
      {
        id: "production_work_orders_archive",
        data: workOrders.archive.data,
        bytes: archiveWorkBytes,
      },
    ]);
  }

  console.log("\nDone. Restart dev server and hard-refresh the ERP.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
