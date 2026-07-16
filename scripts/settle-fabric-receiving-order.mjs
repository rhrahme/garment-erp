#!/usr/bin/env node
/**
 * Settle Fabric Receiving for a sales order that is already done/stitched
 * but still has leftover received/fabric_prep receipts cluttering Active.
 *
 * Preserves receipts by moving them to fabric_receipts_archive as handed_off.
 * Completes open production work orders for the SO. Marks the SO complete.
 *
 * Usage:
 *   node scripts/settle-fabric-receiving-order.mjs SO-2026-0101
 *   node scripts/settle-fabric-receiving-order.mjs SO-2026-0101 --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOCS = {
  sales_orders: {
    key: "sales_orders",
    path: "src/data/sales-orders.json",
    fallback: { updated_at: null, orders: [] },
  },
  fabric_receipts: {
    key: "fabric_receipts",
    path: "src/data/fabric-receipts.json",
    fallback: { updated_at: null, receipts: [] },
  },
  fabric_receipts_archive: {
    key: "fabric_receipts_archive",
    path: "src/data/fabric-receipts-archive.json",
    fallback: { updated_at: null, receipts: [] },
  },
  production_work_orders: {
    key: "production_work_orders",
    path: "src/data/production-work-orders.json",
    fallback: { updated_at: null, work_orders: [] },
  },
};

const ACTIVE_RECEIPT_STATUSES = new Set(["received", "fabric_prep"]);

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
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

function readLocal(spec) {
  const fullPath = resolve(process.cwd(), spec.path);
  if (!existsSync(fullPath)) return structuredClone(spec.fallback);
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function writeLocal(spec, data) {
  const fullPath = resolve(process.cwd(), spec.path);
  writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readDoc(admin, spec) {
  if (!admin) return readLocal(spec);
  const { data, error } = await admin.from("erp_documents").select("data").eq("id", spec.key).maybeSingle();
  if (error) throw new Error(`Supabase read ${spec.key}: ${error.message}`);
  if (data?.data) return data.data;
  return readLocal(spec);
}

async function writeDoc(admin, spec, payload) {
  const next = { ...payload, updated_at: new Date().toISOString() };
  if (admin) {
    const { error } = await admin
      .from("erp_documents")
      .upsert({ id: spec.key, data: next, updated_at: next.updated_at }, { onConflict: "id" });
    if (error) throw new Error(`Supabase write ${spec.key}: ${error.message}`);
  }
  writeLocal(spec, next);
  return next;
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--dry-run");
  const dryRun = process.argv.includes("--dry-run");
  const soNumber = args[0];
  if (!soNumber) {
    console.error("Usage: node scripts/settle-fabric-receiving-order.mjs SO-2026-0101 [--dry-run]");
    process.exit(1);
  }

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin =
    url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

  const salesOrders = await readDoc(admin, DOCS.sales_orders);
  const receipts = await readDoc(admin, DOCS.fabric_receipts);
  const archive = await readDoc(admin, DOCS.fabric_receipts_archive);
  const production = await readDoc(admin, DOCS.production_work_orders);

  const order = salesOrders.orders.find((item) => item.so_number === soNumber);
  if (!order) {
    console.error(`Sales order ${soNumber} not found.`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const toSettle = receipts.receipts.filter(
    (receipt) =>
      receipt.sales_order_id === order.id && ACTIVE_RECEIPT_STATUSES.has(receipt.status)
  );
  const toComplete = production.work_orders.filter(
    (wo) => wo.sales_order_id === order.id && wo.status !== "completed"
  );

  console.log(`Settle Fabric Receiving for ${soNumber} (${order.id})`);
  console.log(`  Current SO status:     ${order.status}`);
  console.log(`  Floor receipts:        ${toSettle.length}`);
  console.log(`  Open work orders:      ${toComplete.length}`);
  console.log(
    `  Receipt ids:           ${toSettle.map((r) => r.id).join(", ") || "(none)"}`
  );

  if (dryRun) {
    console.log("\nDry run — no changes written.");
    return;
  }

  const settled = toSettle.map((receipt) => ({
    ...receipt,
    status: "handed_off",
    fabric_prep_type: null,
    fabric_prep_step: null,
    handed_off_at: receipt.handed_off_at ?? receipt.received_at ?? now,
    updated_at: now,
  }));

  const settleIds = new Set(settled.map((receipt) => receipt.id));
  receipts.receipts = receipts.receipts.filter((receipt) => !settleIds.has(receipt.id));

  for (const receipt of settled) {
    const existing = archive.receipts.findIndex((item) => item.id === receipt.id);
    if (existing >= 0) archive.receipts[existing] = receipt;
    else archive.receipts.push(receipt);
  }

  production.work_orders = production.work_orders.map((wo) => {
    if (wo.sales_order_id !== order.id || wo.status === "completed") return wo;
    return {
      ...wo,
      status: "completed",
      fabric_prep_type: null,
      fabric_prep_step: null,
      completed_at: wo.completed_at ?? wo.received_at ?? now,
      updated_at: now,
    };
  });

  const orderIndex = salesOrders.orders.findIndex((item) => item.id === order.id);
  salesOrders.orders[orderIndex] = { ...order, status: "complete" };

  await writeDoc(admin, DOCS.fabric_receipts, receipts);
  await writeDoc(admin, DOCS.fabric_receipts_archive, archive);
  await writeDoc(admin, DOCS.production_work_orders, production);
  await writeDoc(admin, DOCS.sales_orders, salesOrders);

  console.log("\nWrote local JSON + Supabase.");
  console.log(`  Archived receipts:     ${settled.length}`);
  console.log(`  Completed work orders: ${toComplete.length}`);
  console.log(`  SO status:             complete`);
  console.log("\nHard-refresh Fabric Receiving — SO should leave Active.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
