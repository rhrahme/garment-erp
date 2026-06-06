#!/usr/bin/env node
/**
 * Remove a duplicate sales order and orphan receipts (same client + identical fabric list).
 *
 * Usage:
 *   node scripts/remove-duplicate-sales-order.mjs SO-2026-0098 --keep SO-2026-0101
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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

function orderFabricSignature(lines) {
  return lines
    .map((line) =>
      [line.garment_type, line.fabric_number, line.supplier_id, line.quantity]
        .map((part) => String(part).trim().toLowerCase())
        .join("|")
    )
    .sort()
    .join(";");
}

async function syncDoc(id, data) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const admin = createClient(url, key, { auth: { persistSession: false } });
  await admin.from("erp_documents").upsert(
    { id, data, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
}

async function main() {
  loadEnvLocal();
  const removeSo = process.argv[2];
  const keepIdx = process.argv.indexOf("--keep");
  const keepSo = keepIdx >= 0 ? process.argv[keepIdx + 1] : null;

  if (!removeSo) {
    console.error("Usage: node scripts/remove-duplicate-sales-order.mjs SO-2026-0098 --keep SO-2026-0101");
    process.exit(1);
  }

  const soPath = resolve("src/data/sales-orders.json");
  const frPath = resolve("src/data/fabric-receipts.json");
  const store = JSON.parse(readFileSync(soPath, "utf8"));
  const receipts = JSON.parse(readFileSync(frPath, "utf8"));

  const removeOrder = store.orders.find((o) => o.so_number === removeSo);
  if (!removeOrder) {
    console.error(`Order ${removeSo} not found.`);
    process.exit(1);
  }

  if (keepSo) {
    const keepOrder = store.orders.find((o) => o.so_number === keepSo);
    if (!keepOrder) {
      console.error(`Keep order ${keepSo} not found.`);
      process.exit(1);
    }
    if (orderFabricSignature(removeOrder.fabric_lines) !== orderFabricSignature(keepOrder.fabric_lines)) {
      console.error("Orders do not have identical fabric lists — aborting.");
      process.exit(1);
    }
    if (removeOrder.client_id !== keepOrder.client_id) {
      console.error("Orders are for different clients — aborting.");
      process.exit(1);
    }
  }

  const lineIds = new Set(removeOrder.fabric_lines.map((l) => l.id));
  const beforeReceipts = receipts.receipts.length;
  receipts.receipts = receipts.receipts.filter((r) => {
    if (r.sales_order_id === removeOrder.id) return false;
    if (lineIds.has(r.sales_order_line_id)) return false;
    return true;
  });
  const removedReceipts = beforeReceipts - receipts.receipts.length;

  store.orders = store.orders.filter((o) => o.id !== removeOrder.id);
  store.updated_at = new Date().toISOString();
  receipts.updated_at = new Date().toISOString();

  writeFileSync(soPath, `${JSON.stringify(store, null, 2)}\n`);
  writeFileSync(frPath, `${JSON.stringify(receipts, null, 2)}\n`);

  console.log(`Removed ${removeSo} (${removeOrder.id})`);
  console.log(`Removed ${removedReceipts} orphan receipt(s)`);
  if (keepSo) console.log(`Kept ${keepSo}`);

  await syncDoc("sales_orders", store);
  await syncDoc("fabric_receipts", receipts);
  console.log("Synced to Supabase.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
