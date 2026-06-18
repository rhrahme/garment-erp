#!/usr/bin/env node
/**
 * Fix Moussa Stylbiella order: remove wrongly created SO-2026-0107 and seed the
 * fabric order draft (the incomplete order) to Supabase.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const SALES_ORDERS_PATH = resolve(process.cwd(), "src/data/sales-orders.json");
const DRAFT_FILE = resolve(process.cwd(), "fabric-order-drafts.local.json");
const DOCUMENT_IDS = {
  sales_orders: "sales_orders",
  fabric_order_drafts: "fabric_order_drafts",
};

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

async function upsertDocument(admin, id, data) {
  const updated_at = new Date().toISOString();
  const payload = { ...data, updated_at };
  const { error } = await admin.from("erp_documents").upsert(
    { id, data: payload, updated_at },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Supabase upsert ${id} failed: ${error.message}`);
}

async function main() {
  const store = JSON.parse(readFileSync(SALES_ORDERS_PATH, "utf8"));
  const before = store.orders.length;
  const removed = store.orders.find((o) => o.so_number === "SO-2026-0107");
  store.orders = store.orders.filter((o) => o.so_number !== "SO-2026-0107");
  store.updated_at = new Date().toISOString();

  if (!removed) {
    console.log("SO-2026-0107 not found in sales-orders.json — already removed");
  } else {
    writeFileSync(SALES_ORDERS_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    console.log(`Removed SO-2026-0107 (${removed.id}) — ${before} → ${store.orders.length} orders`);
  }

  const draftFile = JSON.parse(readFileSync(DRAFT_FILE, "utf8"));
  const userDraft = draftFile.drafts?.["info@hagan.pro"];
  const clientDraft = userDraft?.draft?.clientDrafts?.find(
    (cd) => cd.clientId === "cu-abdullah-al-moussa-fouad-rahme"
  );
  const lineCount = clientDraft?.lines?.length ?? 0;
  console.log(`Fabric order draft for Moussa: ${lineCount} line(s)`);

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !serviceKey) {
    console.warn("Skipping Supabase sync — no credentials in .env.local");
    return;
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await upsertDocument(admin, DOCUMENT_IDS.sales_orders, store);

  const { data: remoteRow } = await admin
    .from("erp_documents")
    .select("data")
    .eq("id", DOCUMENT_IDS.fabric_order_drafts)
    .maybeSingle();

  const mergedDrafts = {
    updated_at: new Date().toISOString(),
    drafts: { ...(remoteRow?.data?.drafts ?? {}), ...(draftFile.drafts ?? {}) },
  };
  mergedDrafts.drafts["info@hagan.pro"] = draftFile.drafts["info@hagan.pro"];

  await upsertDocument(admin, DOCUMENT_IDS.fabric_order_drafts, mergedDrafts);
  console.log("Synced sales_orders (without SO-0107) and fabric_order_drafts to Supabase");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
