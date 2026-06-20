#!/usr/bin/env node
/**
 * Link Turki SO-2026-0105 DHL AWBs to PO-2026-0003 and sync shipments to Supabase.
 *
 * Usage: node scripts/link-turki-awbs.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const AWBS = ["6316764576", "6316765840", "6316767844"];
const PURCHASE_ORDER_ID = "po-1781098785699-qfh49k";
const PO_NUMBER = "PO-2026-0003";
const SALES_ORDER_ID = "so-1781094397616";
const STORE_PATH = resolve(process.cwd(), "shipments.local.json");

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

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();

if (!existsSync(STORE_PATH)) {
  console.error("shipments.local.json not found");
  process.exit(1);
}

const store = JSON.parse(readFileSync(STORE_PATH, "utf8"));
let linked = 0;

for (const awb of AWBS) {
  const shipment = store.shipments.find(
    (row) => row.awb_number?.toUpperCase() === awb.toUpperCase()
  );
  if (!shipment) {
    console.error(`AWB ${awb} not found in shipments.local.json`);
    process.exit(1);
  }

  shipment.purchase_order_id = PURCHASE_ORDER_ID;
  shipment.po_number = PO_NUMBER;
  shipment.sales_order_id = SALES_ORDER_ID;
  linked += 1;
  console.log(`Linked ${awb} → ${PO_NUMBER} (${PURCHASE_ORDER_ID})`);
}

writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
console.log(`Updated ${linked} shipments in shipments.local.json`);

if (!url || !serviceKey) {
  console.warn("Supabase credentials missing — local file updated only.");
  process.exit(0);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }),
  },
});

const { error } = await admin.from("erp_documents").upsert(
  { id: "shipments", data: store, updated_at: new Date().toISOString() },
  { onConflict: "id" }
);

if (error) {
  console.error("Supabase upsert failed:", error.message);
  process.exit(1);
}

console.log("✓ Synced shipments document to Supabase");
