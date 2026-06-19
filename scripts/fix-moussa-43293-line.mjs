#!/usr/bin/env node
/**
 * Fix Moussa SO-2026-0109 line 8: 43233/160 → 43293/160, 3 labels (Shirt+Trouser+Short).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SO_ID = "so-1781828734583";
const LINE_ID = "line-1781828734581-7";
const PO_ID = "po-1781828972885-te83l0";
const PO_LINE_ID = "po-1781828972885-te83l0-line-8";
const PATTERN_JOB_ID = "pj-1781828737677-7-k4kkf";
const CLIENT_REF = "FR-0226-0024-SO-2026-0109";

const NEW_FABRIC = "43293/160";
const NEW_GARMENT = "Shirt+Trouser+Short";
const NEW_LABEL_COUNT = 3;
const NEW_UNIT_PRICE = 58.7;
const CATALOG = {
  color: "Mustard",
  composition: "100% WOOL",
  weight_gsm: 260,
  width_cm: 150,
  unit: "meters",
};

const LABEL_STICKERS = [
  { code: `${CLIENT_REF}-L08-SHT`, sequence: 1, piece_name: "Shirt" },
  { code: `${CLIENT_REF}-L08-TR`, sequence: 2, piece_name: "Trouser" },
  { code: `${CLIENT_REF}-L08-SH`, sequence: 3, piece_name: "Short" },
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

async function syncDoc(id, data) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    console.warn("Skipping Supabase sync — no credentials");
    return false;
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const updated_at = new Date().toISOString();
  const payload = { ...data, updated_at: data.updated_at ?? updated_at };
  const { error } = await admin.from("erp_documents").upsert(
    { id, data: payload, updated_at },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Supabase upsert ${id} failed: ${error.message}`);
  return true;
}

function recalcPoTotal(lines) {
  return lines.reduce((sum, line) => sum + line.quantity_ordered * (line.unit_price ?? 0), 0);
}

async function main() {
  const soPath = resolve("src/data/sales-orders.json");
  const poPath = resolve("fabric-orders.local.json");
  const pjPath = resolve("src/data/pattern-jobs.json");

  const soStore = JSON.parse(readFileSync(soPath, "utf8"));
  const poStore = JSON.parse(readFileSync(poPath, "utf8"));
  const pjStore = JSON.parse(readFileSync(pjPath, "utf8"));

  const order = soStore.orders.find((o) => o.id === SO_ID);
  if (!order) throw new Error(`Sales order ${SO_ID} not found`);
  const line = order.fabric_lines.find((l) => l.id === LINE_ID);
  if (!line) throw new Error(`Line ${LINE_ID} not found`);

  const old = {
    fabric_number: line.fabric_number,
    garment_type: line.garment_type,
    label_count: line.label_count,
    unit_price: line.unit_price,
  };

  Object.assign(line, {
    fabric_number: NEW_FABRIC,
    garment_type: NEW_GARMENT,
    label_count: NEW_LABEL_COUNT,
    label_stickers: LABEL_STICKERS,
    unit_price: NEW_UNIT_PRICE,
    color: CATALOG.color,
    composition: CATALOG.composition,
    weight_gsm: CATALOG.weight_gsm,
    width_cm: CATALOG.width_cm,
    unit: CATALOG.unit,
  });

  if (order.notes?.includes("43233/160")) {
    order.notes = order.notes.replace(
      "43233/160: fabric only on paper (catalog has 43233/638, not /160).",
      "43293/160: Shirt+Trouser+Short (corrected from misread 43233/160)."
    );
  }

  soStore.updated_at = new Date().toISOString();
  writeFileSync(soPath, `${JSON.stringify(soStore, null, 2)}\n`);

  const po = poStore.orders.find((o) => o.id === PO_ID);
  if (!po) throw new Error(`Fabric PO ${PO_ID} not found`);
  const poLine = po.lines.find((l) => l.id === PO_LINE_ID);
  if (!poLine) throw new Error(`PO line ${PO_LINE_ID} not found`);

  const oldPoTotal = po.total_amount;
  Object.assign(poLine, {
    fabric_number: NEW_FABRIC,
    garment_type: NEW_GARMENT,
    label_count: NEW_LABEL_COUNT,
    label_stickers: LABEL_STICKERS,
    unit_price: NEW_UNIT_PRICE,
  });
  po.total_amount = recalcPoTotal(po.lines);
  writeFileSync(poPath, `${JSON.stringify(poStore, null, 2)}\n`);

  const pj = pjStore.jobs.find((j) => j.id === PATTERN_JOB_ID);
  if (pj) {
    Object.assign(pj, {
      fabric_number: NEW_FABRIC,
      garment_type: NEW_GARMENT,
      piece_name: "Shirt",
      composition: CATALOG.composition,
      gsm: CATALOG.weight_gsm,
      width_cm: CATALOG.width_cm,
      color: CATALOG.color,
      updated_at: new Date().toISOString(),
    });
    pjStore.updated_at = new Date().toISOString();
    writeFileSync(pjPath, `${JSON.stringify(pjStore, null, 2)}\n`);
  }

  loadEnvLocal();
  await syncDoc("sales_orders", soStore);
  await syncDoc("fabric_orders", poStore);
  if (pj) await syncDoc("pattern_jobs", pjStore);

  console.log(JSON.stringify({
    sales_order: order.so_number,
    line_id: LINE_ID,
    article: "L08",
    old,
    new: {
      fabric_number: NEW_FABRIC,
      garment_type: NEW_GARMENT,
      label_count: NEW_LABEL_COUNT,
      unit_price: NEW_UNIT_PRICE,
      label_stickers: LABEL_STICKERS.map((s) => s.code),
    },
    fabric_po: {
      id: PO_ID,
      po_number: po.po_number,
      supplier: po.supplier?.name ?? po.supplier_id,
      line_id: PO_LINE_ID,
      old_total: oldPoTotal,
      new_total: po.total_amount,
      status: po.status,
      emailed_at: po.emailed_at,
    },
    pattern_job_updated: pj?.id ?? null,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
