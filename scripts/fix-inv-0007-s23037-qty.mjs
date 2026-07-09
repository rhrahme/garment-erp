#!/usr/bin/env node
/**
 * INV-2026-0007: set fabric S23037 line quantity from 2 -> 1, recompute totals.
 *
 *   node scripts/fix-inv-0007-s23037-qty.mjs          (local JSON only)
 *   node scripts/fix-inv-0007-s23037-qty.mjs --sync   (also push to Supabase)
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const INVOICES_PATH = "src/data/customer-invoices.json";
const INVOICE_NUMBER = "INV-2026-0007";
const FABRIC_NUMBER = "S23037";
const NEW_QTY = 1;

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
    if (!process.env[key]) process.env[key] = value;
  }
}

function roundMoney(amount) {
  return Math.round(amount * 100) / 100;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function writeJson(path, data) {
  writeFileSync(resolve(process.cwd(), path), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function syncToSupabase(data) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !serviceKey) throw new Error("Missing Supabase credentials in .env.local");
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.from("erp_documents").upsert(
    { id: "customer_invoices", data, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) throw new Error(`customer_invoices: ${error.message}`);
  console.log("✓ synced customer_invoices to Supabase");
}

async function main() {
  const sync = process.argv.includes("--sync");
  const file = readJson(INVOICES_PATH);

  const invoice = file.invoices.find((row) => row.invoice_number === INVOICE_NUMBER);
  if (!invoice) throw new Error(`Invoice not found: ${INVOICE_NUMBER}`);

  const line = invoice.lines.find((l) => l.fabric_number === FABRIC_NUMBER);
  if (!line) throw new Error(`Line with fabric ${FABRIC_NUMBER} not found on ${INVOICE_NUMBER}`);

  const beforeSubtotal = invoice.subtotal;
  const beforeVat = invoice.vat_amount;
  const beforeTotal = invoice.total;
  const oldQty = line.quantity;
  const oldLineTotal = line.line_total;

  line.quantity = NEW_QTY;
  line.line_total = roundMoney(line.unit_price * NEW_QTY);

  const subtotal = roundMoney(invoice.lines.reduce((sum, l) => sum + l.line_total, 0));
  const rate = invoice.vat_rate != null && invoice.vat_rate > 0 ? invoice.vat_rate : 0;
  const vat_amount = rate > 0 ? roundMoney(subtotal * rate) : 0;
  const total = roundMoney(subtotal + vat_amount);

  invoice.subtotal = subtotal;
  invoice.vat_amount = vat_amount;
  invoice.total = total;
  invoice.updated_at = new Date().toISOString();
  file.updated_at = new Date().toISOString();

  writeJson(INVOICES_PATH, file);

  console.log(`Invoice: ${INVOICE_NUMBER} (${invoice.id})`);
  console.log(`Line: article ${line.article_number} fabric ${FABRIC_NUMBER} (${line.sticker_code})`);
  console.log(`  qty:        ${oldQty} -> ${line.quantity}`);
  console.log(`  unit_price: ${line.unit_price}`);
  console.log(`  line_total: ${oldLineTotal} -> ${line.line_total}`);
  console.log(`  subtotal:   ${beforeSubtotal} -> ${subtotal}`);
  console.log(`  vat_amount: ${beforeVat} -> ${vat_amount} (rate ${invoice.vat_rate})`);
  console.log(`  total:      ${beforeTotal} -> ${total}`);

  if (sync) await syncToSupabase(file);
  else console.log("\nRun with --sync to push customer_invoices to Supabase.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
