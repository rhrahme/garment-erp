#!/usr/bin/env node
/**
 * Recover missing fabric PO po-1783030651405-g1ekcn for SO-2026-0116 (so-1783008349661).
 *
 * The sales order references this PO in fabric_po_ids but the record was lost from
 * fabric_orders (likely a cold serverless write before ensureDocumentsLoaded).
 *
 *   node scripts/recover-so-0116-fabric-po.mjs
 *   node scripts/recover-so-0116-fabric-po.mjs --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SALES_ORDER_ID = "so-1783008349661";
const PO_ID = "po-1783030651405-g1ekcn";
const PO_NUMBER = "PO-2026-0015";
const DRY_RUN = process.argv.includes("--dry-run");

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
    if (!process.env[key]) process.env[key] = value.replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

function readJson(relPath, fallback) {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), relPath), "utf8"));
  } catch {
    return fallback;
  }
}

async function loadDocument(key) {
  const { data, error } = await supabase
    .from("erp_documents")
    .select("data, updated_at")
    .eq("id", key)
    .maybeSingle();
  if (error) throw error;
  return data?.data ?? null;
}

async function saveDocument(key, content) {
  const { error } = await supabase.from("erp_documents").upsert(
    { id: key, data: content, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) throw error;
}

const salesStore = readJson("src/data/sales-orders.json", { orders: [] });
const contacts = readJson("src/data/suppliers/contacts.json", { suppliers: [] });
const salesOrder = salesStore.orders.find((order) => order.id === SALES_ORDER_ID);

if (!salesOrder) {
  console.error(`Sales order ${SALES_ORDER_ID} not found`);
  process.exit(1);
}

if (!salesOrder.fabric_po_ids?.includes(PO_ID)) {
  console.error(`Sales order does not reference ${PO_ID}`);
  process.exit(1);
}

const supplier = contacts.suppliers.find((row) => row.id === "loro-piana");
if (!supplier) {
  console.error("loro-piana supplier contact not found");
  process.exit(1);
}

const clientReference = salesOrder.client_reference ?? `FR-0626-0037-SO-2026-0116`;
const lines = salesOrder.fabric_lines.map((line, index) => ({
  id: `${PO_ID}-line-${index + 1}`,
  fabric_number: line.fabric_number,
  quantity_ordered: line.quantity,
  unit_price: line.unit_price ?? 0,
  label_count: line.label_count ?? null,
  label_stickers: line.label_stickers ?? null,
  garment_type: line.garment_type ?? null,
  client_reference: clientReference,
  emailed_at: null,
}));

const recoveredPo = {
  id: PO_ID,
  po_number: PO_NUMBER,
  supplier_id: "loro-piana",
  status: "draft",
  order_date: salesOrder.fabric_order_requested_at?.slice(0, 10) ?? "2026-07-02",
  expected_date: null,
  total_amount: lines.reduce((sum, line) => sum + line.quantity_ordered * line.unit_price, 0),
  client_reference: clientReference,
  emailed_at: null,
  email_to: null,
  expected_carrier: "DHL",
  sales_order_id: SALES_ORDER_ID,
  supplier: {
    id: "loro-piana",
    code: supplier.code ?? "LORO-PIANA",
    name: supplier.name ?? "Loro Piana",
    email: supplier.emails?.join(", ") ?? supplier.email ?? null,
    emails: supplier.emails ?? (supplier.email ? [supplier.email] : []),
    country: supplier.country ?? "Italy",
    contact_person: supplier.contact_person ?? null,
    lead_time_days: supplier.lead_time_days ?? 14,
    is_fabric_supplier: true,
  },
  lines,
};

async function main() {
  const remoteStore = (await loadDocument("fabric_orders")) ?? { orders: [] };
  const existing = remoteStore.orders?.find((order) => order.id === PO_ID);

  if (existing) {
    console.log(`PO ${PO_ID} already exists (${existing.po_number}) — nothing to do.`);
    console.log({
      sales_order_id: existing.sales_order_id,
      emailed_at: existing.emailed_at,
      lines: existing.lines?.length,
      line_emailed: existing.lines?.filter((line) => line.emailed_at).length ?? 0,
    });
    return;
  }

  console.log(`Recovering ${PO_ID} with ${lines.length} lines for ${salesOrder.so_number}`);
  if (DRY_RUN) {
    console.log("Dry run — would append PO and save fabric_orders to Supabase.");
    return;
  }

  remoteStore.orders = [recoveredPo, ...(remoteStore.orders ?? [])];
  await saveDocument("fabric_orders", remoteStore);
  console.log(`Saved ${PO_ID} (${PO_NUMBER}) to Supabase fabric_orders.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
