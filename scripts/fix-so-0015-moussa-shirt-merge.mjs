#!/usr/bin/env node
/**
 * Fix SO-2026-0015 / INV-2026-0005 (Khaled Al Moussa):
 * - Merge duplicate Shirt LS fabric lines (1415541-1 + C1415541-1) into one L04 line with 2 stickers
 * - Invoice: Shirt LS qty 2 @ 245.58 SAR
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SO_ID = "so-cu-86exaff6e";
const SHIRT_LINE_ID = "line-1782644353237-4";
const DUPLICATE_SHIRT_LINE_ID = "line-1782644523158-4";
const INVOICE_ID = "inv-1782748824218-xl1a29";
const CLIENT_REF = "FR-0426-0007-SO-2026-0015";
const SHIRT_UNIT_PRICE = 245.58;
const DUPLICATE_PATTERN_JOB_ID = "pj-1782644525541-3-m5hw2";
const KEPT_PATTERN_JOB_ID = "pj-1782644356181-3-0jhat";

const LABEL_STICKERS = [
  { code: `${CLIENT_REF}-L04-SHT-LS`, sequence: 1, piece_name: "Shirt LS" },
  { code: `${CLIENT_REF}-L04-SHT-LS`, sequence: 2, piece_name: "Shirt LS" },
];

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

function roundMoney(amount) {
  return Math.round(amount * 100) / 100;
}

async function fetchDoc(admin, id) {
  const { data, error } = await admin.from("erp_documents").select("data").eq("id", id).single();
  if (error) throw new Error(`Fetch ${id}: ${error.message}`);
  return data.data;
}

async function syncDoc(admin, id, data) {
  const updated_at = new Date().toISOString();
  const payload = { ...data, updated_at: data.updated_at ?? updated_at };
  const { error } = await admin
    .from("erp_documents")
    .upsert({ id, data: payload, updated_at }, { onConflict: "id" });
  if (error) throw new Error(`Supabase upsert ${id}: ${error.message}`);
  return payload;
}

function fixSalesOrder(store) {
  const order = store.orders.find((o) => o.id === SO_ID);
  if (!order) throw new Error(`Sales order ${SO_ID} not found`);

  const shirtLine = order.fabric_lines.find((l) => l.id === SHIRT_LINE_ID);
  const dupLine = order.fabric_lines.find((l) => l.id === DUPLICATE_SHIRT_LINE_ID);
  if (!shirtLine) throw new Error(`Shirt line ${SHIRT_LINE_ID} not found`);
  if (!dupLine) throw new Error(`Duplicate shirt line ${DUPLICATE_SHIRT_LINE_ID} not found`);

  const before = {
    line_count: order.fabric_lines.length,
    shirt_lines: order.fabric_lines
      .filter((l) => l.garment_type === "Shirt LS")
      .map((l) => ({
        id: l.id,
        fabric_number: l.fabric_number,
        quantity: l.quantity,
        label_count: l.label_count,
        stickers: (l.label_stickers ?? []).map((s) => s.code),
      })),
  };

  Object.assign(shirtLine, {
    fabric_number: "C1415541-1",
    quantity: roundMoney((shirtLine.quantity ?? 0) + (dupLine.quantity ?? 0)),
    composition: shirtLine.composition ?? dupLine.composition ?? "100% cotton",
    stock_status: shirtLine.stock_status ?? dupLine.stock_status ?? "in_stock",
    label_count: 2,
    label_stickers: LABEL_STICKERS,
  });

  order.fabric_lines = order.fabric_lines.filter((l) => l.id !== DUPLICATE_SHIRT_LINE_ID);

  const after = {
    line_count: order.fabric_lines.length,
    shirt_line: {
      id: shirtLine.id,
      fabric_number: shirtLine.fabric_number,
      quantity: shirtLine.quantity,
      label_count: shirtLine.label_count,
      stickers: shirtLine.label_stickers.map((s) => ({ code: s.code, sequence: s.sequence })),
      articles: order.fabric_lines.map((l, i) => ({
        index: i + 1,
        garment: l.garment_type,
        sticker: l.label_stickers?.[0]?.code?.match(/L\d{2}/)?.[0] ?? null,
      })),
    },
  };

  store.updated_at = new Date().toISOString();
  return { before, after };
}

function fixInvoice(store) {
  const invoice = store.invoices.find((i) => i.id === INVOICE_ID);
  if (!invoice) throw new Error(`Invoice ${INVOICE_ID} not found`);

  const shirtLine = invoice.lines.find((l) => l.garment_type === "Shirt LS");
  if (!shirtLine) throw new Error("Invoice shirt line not found");

  const before = {
    quantity: shirtLine.quantity,
    unit_price: shirtLine.unit_price,
    line_total: shirtLine.line_total,
    fabric_number: shirtLine.fabric_number,
    subtotal: invoice.subtotal,
    total: invoice.total,
  };

  const lineTotal = roundMoney(SHIRT_UNIT_PRICE * 2);
  Object.assign(shirtLine, {
    quantity: 2,
    unit_price: SHIRT_UNIT_PRICE,
    line_total: lineTotal,
    fabric_number: "C1415541-1",
    sales_order_line_id: SHIRT_LINE_ID,
    cost_hint_sar: lineTotal,
    fabric_cost_hint_sar: roundMoney(25.58 * 2),
  });

  invoice.subtotal = lineTotal;
  invoice.total = lineTotal;
  invoice.updated_at = new Date().toISOString();

  const after = {
    quantity: shirtLine.quantity,
    unit_price: shirtLine.unit_price,
    line_total: shirtLine.line_total,
    fabric_number: shirtLine.fabric_number,
    subtotal: invoice.subtotal,
    total: invoice.total,
    suit_line_unchanged: invoice.lines.find((l) => l.garment_type === "Suit")?.description ?? null,
  };

  store.updated_at = new Date().toISOString();
  return { before, after };
}

function fixPatternJobs(store) {
  const before = store.jobs
    .filter((j) => j.sales_order_id === SO_ID && j.garment_type === "Shirt LS")
    .map((j) => ({ id: j.id, line: j.sales_order_line_id, fabric: j.fabric_number, meters: j.meters, status: j.status }));

  store.jobs = store.jobs.filter((j) => j.id !== DUPLICATE_PATTERN_JOB_ID);

  const kept = store.jobs.find((j) => j.id === KEPT_PATTERN_JOB_ID);
  if (kept) {
    Object.assign(kept, {
      fabric_number: "C1415541-1",
      meters: 3,
      article_number: 4,
      piece_name: "Shirt LS",
      composition: kept.composition ?? "100% cotton",
      updated_at: new Date().toISOString(),
    });
  }

  const after = store.jobs
    .filter((j) => j.sales_order_id === SO_ID && j.garment_type === "Shirt LS")
    .map((j) => ({ id: j.id, line: j.sales_order_line_id, fabric: j.fabric_number, meters: j.meters, status: j.status }));

  store.updated_at = new Date().toISOString();
  return { before, after };
}

function patchLocalJson(filePath, collectionKey, itemId, item) {
  const store = JSON.parse(readFileSync(filePath, "utf8"));
  const index = store[collectionKey].findIndex((row) => row.id === itemId);
  if (index < 0) throw new Error(`${itemId} not found in ${filePath}`);
  store[collectionKey][index] = item;
  store.updated_at = new Date().toISOString();
  writeFileSync(resolve(filePath), `${JSON.stringify(store, null, 2)}\n`);
}

function patchLocalPatternJobs(filePath, pjChanges) {
  const store = JSON.parse(readFileSync(filePath, "utf8"));
  const removeIds = new Set(
    pjChanges.before
      .map((row) => row.id)
      .filter((id) => !pjChanges.after.some((kept) => kept.id === id))
  );
  store.jobs = store.jobs.filter((job) => !removeIds.has(job.id));
  for (const after of pjChanges.after) {
    const index = store.jobs.findIndex((job) => job.id === after.id);
    const source = pjChanges.before.find((row) => row.id === after.id);
    if (index >= 0) {
      Object.assign(store.jobs[index], {
        sales_order_line_id: after.line,
        fabric_number: after.fabric,
        meters: after.meters,
        status: after.status,
        updated_at: new Date().toISOString(),
      });
    } else if (source) {
      // no-op: local may use a different job id for the same line
    }
  }
  store.updated_at = new Date().toISOString();
  writeFileSync(resolve(filePath), `${JSON.stringify(store, null, 2)}\n`);
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) throw new Error("Missing Supabase credentials in .env.local");

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const soStore = await fetchDoc(admin, "sales_orders");
  const invStore = await fetchDoc(admin, "customer_invoices");
  const pjStore = await fetchDoc(admin, "pattern_jobs");

  const soChanges = fixSalesOrder(soStore);
  const invChanges = fixInvoice(invStore);
  const pjChanges = fixPatternJobs(pjStore);

  const soPath = "src/data/sales-orders.json";
  const invPath = "src/data/customer-invoices.json";
  const pjPath = "src/data/pattern-jobs.json";

  await syncDoc(admin, "sales_orders", soStore);
  await syncDoc(admin, "customer_invoices", invStore);
  await syncDoc(admin, "pattern_jobs", pjStore);

  patchLocalJson(soPath, "orders", SO_ID, soStore.orders.find((o) => o.id === SO_ID));
  patchLocalJson(invPath, "invoices", INVOICE_ID, invStore.invoices.find((i) => i.id === INVOICE_ID));
  patchLocalPatternJobs(pjPath, pjChanges);

  console.log(
    JSON.stringify(
      {
        sales_order: soChanges,
        invoice: invChanges,
        pattern_jobs: pjChanges,
        sticker_count: 2,
        sticker_codes: LABEL_STICKERS.map((s) => s.code),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
