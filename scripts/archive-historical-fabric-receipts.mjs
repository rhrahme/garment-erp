#!/usr/bin/env node
/**
 * Clear historical fabric from the receiving queue — mark receipts handed off
 * and complete any linked production work orders.
 *
 * Usage:
 *   node scripts/archive-historical-fabric-receipts.mjs
 *   node scripts/archive-historical-fabric-receipts.mjs --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ACTIVE_RECEIPT_STATUSES = new Set(["received", "fabric_prep"]);
const FINAL_WORK_ORDER_STATUS = "completed";

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
  if (!existsSync(full)) return fallback;
  return JSON.parse(readFileSync(full, "utf8"));
}

function writeJson(relPath, data) {
  const full = resolve(process.cwd(), relPath);
  writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function syncToSupabase(documentKey, payload) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(`  (skip Supabase sync for ${documentKey} — credentials missing)`);
    return false;
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const updated_at = new Date().toISOString();
  const { error } = await admin.from("erp_documents").upsert(
    { id: documentKey, data: payload, updated_at },
    { onConflict: "id" }
  );

  if (error) {
    console.error(`  Supabase upsert failed for ${documentKey}:`, error.message);
    return false;
  }
  return true;
}

function archiveReceipts(receipts, now) {
  const archivedLineIds = new Set();
  let archived = 0;

  for (const receipt of receipts) {
    if (!ACTIVE_RECEIPT_STATUSES.has(receipt.status)) continue;
    receipt.status = "handed_off";
    receipt.fabric_prep_type = null;
    receipt.fabric_prep_step = null;
    receipt.handed_off_at = receipt.received_at ?? now;
    receipt.updated_at = now;
    archivedLineIds.add(receipt.sales_order_line_id);
    archived += 1;
  }

  return { archived, archivedLineIds };
}

function completeWorkOrders(workOrders, lineIds, now) {
  let completed = 0;

  for (const order of workOrders) {
    if (!lineIds.has(order.sales_order_line_id)) continue;
    if (order.status === FINAL_WORK_ORDER_STATUS) continue;
    order.status = FINAL_WORK_ORDER_STATUS;
    order.completed_at = order.completed_at ?? order.received_at ?? now;
    order.updated_at = now;
    order.fabric_prep_type = null;
    order.fabric_prep_step = null;
    completed += 1;
  }

  return completed;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  loadEnvLocal();

  const receiptsFile = readJson("src/data/fabric-receipts.json", { updated_at: null, receipts: [] });
  const workOrdersFile = readJson("src/data/production-work-orders.json", {
    updated_at: null,
    work_orders: [],
  });

  const beforeReceipts = receiptsFile.receipts.filter((r) => ACTIVE_RECEIPT_STATUSES.has(r.status)).length;
  const beforeActive = receiptsFile.receipts.filter((r) => r.status === "received").length;

  const now = new Date().toISOString();
  const { archived, archivedLineIds } = archiveReceipts(receiptsFile.receipts, now);
  const completedWorkOrders = completeWorkOrders(workOrdersFile.work_orders, archivedLineIds, now);

  const afterActive = receiptsFile.receipts.filter(
    (r) => r.status === "received" || r.status === "fabric_prep"
  ).length;

  console.log("Archive historical fabric receiving");
  console.log(`  Receipts awaiting prep before: ${beforeReceipts} (${beforeActive} received)`);
  console.log(`  Receipts to archive:           ${archived}`);
  console.log(`  Work orders to complete:       ${completedWorkOrders}`);
  console.log(`  Active queue after:            ${afterActive}`);

  if (dryRun) {
    console.log("\nDry run — no files or Supabase updated.");
    return;
  }

  receiptsFile.updated_at = now;
  workOrdersFile.updated_at = now;
  writeJson("src/data/fabric-receipts.json", receiptsFile);
  writeJson("src/data/production-work-orders.json", workOrdersFile);

  console.log("\nWrote local JSON.");

  const syncedReceipts = await syncToSupabase("fabric_receipts", receiptsFile);
  const syncedWorkOrders = await syncToSupabase("production_work_orders", workOrdersFile);
  if (syncedReceipts && syncedWorkOrders) {
    console.log("Synced fabric_receipts and production_work_orders to Supabase.");
  }

  console.log("\nDone. Refresh Fabric Receiving — the queue should be empty.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
