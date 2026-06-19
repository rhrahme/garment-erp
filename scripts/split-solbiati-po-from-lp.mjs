#!/usr/bin/env node
/**
 * Split Solbiati fabric lines out of a merged Loro Piana PO into a pending Solbiati PO.
 *
 * Usage:
 *   node scripts/split-solbiati-po-from-lp.mjs --po PO-2026-0012 --dry-run
 *   node scripts/split-solbiati-po-from-lp.mjs --po PO-2026-0012
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SOLBIATI_FABRICS = new Set([
  "S25032",
  "S13028",
  "S23024",
  "S23014",
  "S05007",
  "S05006",
  "S10008",
]);

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

function isSolbiatiLine(line) {
  const fabric = (line.fabric_number ?? "").trim().toUpperCase();
  if (SOLBIATI_FABRICS.has(fabric)) return true;
  return /^S/.test(fabric);
}

function lineTotal(line) {
  return (line.quantity_ordered ?? 0) * (line.unit_price ?? 0);
}

function recalcTotal(lines) {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

loadEnvLocal();

const dryRun = process.argv.includes("--dry-run");
const poArgIdx = process.argv.indexOf("--po");
const targetPoNumber = poArgIdx >= 0 ? process.argv[poArgIdx + 1] : "PO-2026-0012";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();

if (!url || !serviceKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [{ data: fabricRow, error: fabricError }, { data: salesRow, error: salesError }, { data: contactsRow, error: contactsError }] =
  await Promise.all([
    admin.from("erp_documents").select("data,updated_at").eq("id", "fabric_orders").maybeSingle(),
    admin.from("erp_documents").select("data,updated_at").eq("id", "sales_orders").maybeSingle(),
    admin.from("erp_documents").select("data").eq("id", "supplier_contacts").maybeSingle(),
  ]);

if (fabricError || salesError || contactsError) {
  console.error("Failed to read documents:", fabricError?.message ?? salesError?.message ?? contactsError?.message);
  process.exit(1);
}

const fabricStore = fabricRow?.data ?? { orders: [] };
const salesStore = salesRow?.data ?? { orders: [] };
const contacts = contactsRow?.data?.suppliers ?? contactsRow?.data?.contacts ?? [];

const solbiatiContact = contacts.find((s) => s.id === "solbiati");
if (!solbiatiContact) {
  console.error("Solbiati supplier contact not found.");
  process.exit(1);
}

const poIndex = fabricStore.orders.findIndex((order) => order.po_number === targetPoNumber);
if (poIndex < 0) {
  console.error(`PO ${targetPoNumber} not found.`);
  process.exit(1);
}

const sourcePo = fabricStore.orders[poIndex];
const allLines = sourcePo.lines ?? [];
const solbiatiLines = allLines.filter(isSolbiatiLine);
const loroLines = allLines.filter((line) => !isSolbiatiLine(line));

if (solbiatiLines.length === 0) {
  console.log(`No Solbiati lines in ${targetPoNumber} — nothing to split.`);
  process.exit(0);
}

const existingSolbiatiPo = fabricStore.orders.find(
  (order) =>
    order.supplier_id === "solbiati" &&
    order.sales_order_id === sourcePo.sales_order_id &&
    order.status !== "cancelled"
);

if (existingSolbiatiPo) {
  console.log(`Solbiati PO already exists: ${existingSolbiatiPo.po_number} (${existingSolbiatiPo.lines?.length ?? 0} lines)`);
  process.exit(0);
}

const nextNum = fabricStore.orders.length + 1;
const newPoId = `po-${Date.now()}-solbiati`;
const newPoNumber = `PO-${new Date().getFullYear()}-${String(nextNum).padStart(4, "0")}`;

const solbiatiPo = {
  id: newPoId,
  po_number: newPoNumber,
  supplier_id: "solbiati",
  status: "draft",
  order_date: new Date().toISOString().slice(0, 10),
  expected_date: null,
  total_amount: recalcTotal(solbiatiLines),
  client_reference: sourcePo.client_reference,
  emailed_at: null,
  email_to: null,
  expected_carrier: sourcePo.expected_carrier ?? "DHL",
  sales_order_id: sourcePo.sales_order_id ?? null,
  supplier: {
    id: solbiatiContact.id,
    code: solbiatiContact.code,
    name: solbiatiContact.name,
    contact_person: solbiatiContact.contact_person ?? null,
    email: solbiatiContact.email ?? null,
    emails: solbiatiContact.emails ?? [],
    country: solbiatiContact.country ?? null,
    is_fabric_supplier: true,
    lead_time_days: solbiatiContact.lead_time_days ?? null,
  },
  lines: solbiatiLines.map((line, index) => ({
    ...line,
    id: `${newPoId}-line-${index + 1}`,
  })),
};

const updatedSourcePo = {
  ...sourcePo,
  lines: loroLines,
  total_amount: recalcTotal(loroLines),
};

console.log(`Split ${targetPoNumber}:`);
console.log(`  Loro Piana lines kept: ${loroLines.length} (${loroLines.map((l) => l.fabric_number).join(", ")})`);
console.log(`  Solbiati lines extracted: ${solbiatiLines.length} (${solbiatiLines.map((l) => l.fabric_number).join(", ")})`);
console.log(`  New pending PO: ${newPoNumber} (${newPoId})`);

if (dryRun) {
  console.log("\nDry run — no data written.");
  process.exit(0);
}

fabricStore.orders[poIndex] = updatedSourcePo;
fabricStore.orders.unshift(solbiatiPo);

const salesOrderIndex = salesStore.orders.findIndex((order) => order.id === sourcePo.sales_order_id);
if (salesOrderIndex >= 0) {
  const salesOrder = salesStore.orders[salesOrderIndex];
  const poIds = new Set(salesOrder.fabric_po_ids ?? []);
  poIds.add(newPoId);
  salesStore.orders[salesOrderIndex] = {
    ...salesOrder,
    fabric_po_ids: [...poIds],
  };
}

const updated_at = new Date().toISOString();
const [{ error: writeFabricError }, { error: writeSalesError }] = await Promise.all([
  admin.from("erp_documents").upsert({ id: "fabric_orders", data: fabricStore, updated_at }, { onConflict: "id" }),
  admin.from("erp_documents").upsert({ id: "sales_orders", data: salesStore, updated_at }, { onConflict: "id" }),
]);

if (writeFabricError || writeSalesError) {
  console.error("Upload failed:", writeFabricError?.message ?? writeSalesError?.message);
  process.exit(1);
}

console.log(`\n✓ Created ${newPoNumber} and updated ${targetPoNumber} in Supabase.`);
