#!/usr/bin/env node
/**
 * Recover Ajlan Mohamad (FR-0626-0035) sales order SO-2026-0107 from pattern jobs.
 * The order was lost when fix-moussa-stylbiella-draft.mjs removed ALL SO-2026-0107 rows
 * without checking client_id. Pattern jobs still reference so-1781358783222.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CLIENT_ID = "new-1781348265572";
const ORDER_ID = "so-1781358783222";
const SO_NUMBER = "SO-2026-0107";
const CLIENT_CODE = "FR-0626-0035";
const CLIENT_NAME = "Ajlan Mohamad Al Ajlan";
const CLIENT_REF = `${CLIENT_CODE}-${SO_NUMBER}`;

const SUPPLIER_IDS = {
  "Loro Piana": "loro-piana",
  Drapers: "drapers",
  Solbiati: "solbiati",
};

const PIECE_ABBREV = {
  Jacket: "JKT",
  Trouser: "TR",
  Shirt: "SHT",
  "Shirt LS": "SHT-LS",
  "Shirt SS": "SHT-SS",
};

function getGarmentPieces(garmentType) {
  const multi = {
    Suit: ["Jacket", "Trouser"],
    "Overshirt+Trouser": ["Overshirt", "Trouser"],
    "Shirt+Trouser": ["Shirt", "Trouser"],
    "Shirt+Trouser+Short": ["Shirt", "Trouser", "Short"],
    "Shirt+Short": ["Shirt", "Short"],
    "Thobe+Jacket": ["Thobe", "Jacket"],
    "Thobe+Vest": ["Thobe", "Vest"],
    "Fabric only": [],
  };
  return multi[garmentType] ?? [garmentType];
}

function pieceAbbrev(pieceName) {
  return PIECE_ABBREV[pieceName] ?? pieceName.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
}

function generateLabelStickers(lineIndex, garmentType) {
  const pieces = getGarmentPieces(garmentType);
  const linePart = `L${String(lineIndex).padStart(2, "0")}`;
  return pieces.map((piece_name, index) => ({
    code: `${CLIENT_REF}-${linePart}-${pieceAbbrev(piece_name)}`,
    piece_name,
    sequence: index + 1,
  }));
}

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

function buildOrderFromPatternJobs(jobs) {
  const sorted = [...jobs].sort((a, b) => a.article_number - b.article_number);
  const createdAt = sorted[0]?.created_at ?? new Date().toISOString();
  const orderDate = createdAt.slice(0, 10);

  const fabric_lines = sorted.map((job, index) => {
    const lineIndex = index + 1;
    const garment_type = job.garment_type;
    const label_stickers = generateLabelStickers(lineIndex, garment_type);
    const supplier_id = SUPPLIER_IDS[job.supplier] ?? job.supplier.toLowerCase().replace(/\s+/g, "-");

    return {
      id: job.sales_order_line_id,
      unit: "meters",
      color: job.color,
      added_at: job.created_at,
      added_by: "info@hagan.pro",
      quantity: job.meters,
      width_cm: job.width_cm,
      unit_price: 0,
      weight_gsm: job.gsm,
      composition: job.composition,
      label_count: label_stickers.length,
      supplier_id,
      garment_type,
      restock_date: null,
      stock_status: null,
      width_inches: job.width_inches,
      a4_printed_at: null,
      fabric_number: job.fabric_number,
      supplier_name: job.supplier,
      label_stickers,
      needs_replacement: false,
      prep_stickers_printed_at: null,
      prod_stickers_printed_at: null,
      replacement_fabric_number: null,
    };
  });

  return {
    id: ORDER_ID,
    notes: "Recovered from pattern jobs after accidental removal with Moussa SO-2026-0107 cleanup.",
    status: "open",
    client_id: CLIENT_ID,
    so_number: SO_NUMBER,
    order_date: orderDate,
    client_code: CLIENT_CODE,
    client_name: CLIENT_NAME,
    fabric_lines,
    delivery_date: null,
    fabric_po_ids: [],
    client_reference: CLIENT_REF,
    delivery_destination: null,
  };
}

async function main() {
  const soPath = resolve("src/data/sales-orders.json");
  const pjPath = resolve("src/data/pattern-jobs.json");
  const now = new Date().toISOString();

  const soStore = JSON.parse(readFileSync(soPath, "utf8"));
  const pjStore = JSON.parse(readFileSync(pjPath, "utf8"));

  if (soStore.orders.some((o) => o.id === ORDER_ID)) {
    console.log(`Order ${ORDER_ID} already exists — nothing to do`);
    return;
  }
  if (soStore.orders.some((o) => o.so_number === SO_NUMBER)) {
    throw new Error(`${SO_NUMBER} already taken by another order — resolve conflict manually`);
  }

  const jobs = pjStore.jobs.filter(
    (j) => j.client_id === CLIENT_ID && j.sales_order_id === ORDER_ID && j.status !== "cancelled"
  );
  if (jobs.length === 0) {
    throw new Error("No active Ajlan pattern jobs found for recovery");
  }

  const order = buildOrderFromPatternJobs(jobs);
  soStore.orders.unshift(order);
  soStore.updated_at = now;
  writeFileSync(soPath, `${JSON.stringify(soStore, null, 2)}\n`);

  let updatedJobs = 0;
  for (const job of pjStore.jobs) {
    if (job.sales_order_id !== ORDER_ID || job.client_id !== CLIENT_ID) continue;
    if (job.so_number === SO_NUMBER && job.client_name === CLIENT_NAME) continue;
    job.so_number = SO_NUMBER;
    job.client_name = CLIENT_NAME;
    job.client_code = CLIENT_CODE;
    job.updated_at = now;
    updatedJobs += 1;
  }
  pjStore.updated_at = now;
  writeFileSync(pjPath, `${JSON.stringify(pjStore, null, 2)}\n`);

  loadEnvLocal();
  await syncDoc("sales_orders", soStore);
  await syncDoc("pattern_jobs", pjStore);

  console.log(
    JSON.stringify(
      {
        recovered: {
          id: order.id,
          so_number: order.so_number,
          client: order.client_name,
          lines: order.fabric_lines.length,
          status: order.status,
        },
        pattern_jobs_aligned: updatedJobs,
        url: `/orders/${ORDER_ID}`,
        production_url: `https://erp.hagan.pro/orders/${ORDER_ID}`,
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
