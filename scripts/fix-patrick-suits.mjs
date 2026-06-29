#!/usr/bin/env node
/**
 * Fix Patrick Raupach SO-2026-0103 suits: add missing trouser fabric lines,
 * restore JKT+TR stickers on suit lines, add trouser pattern jobs, sync Supabase.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SO_ID = "so-1780844985084";
const SO_NUMBER = "SO-2026-0103";
const CLIENT_REF = "GL-0326-0003-SO-2026-0103";

/** Standalone trouser lines paired with existing suit lines (from SO-0009 / ClickUp 86ewrz18x). */
const TROUSER_LINES = [
  {
    id: "line-1781346044433-13-tr",
    article: 16,
    fabric_number: "10005. 001/204D",
    color: "Light Blue",
    composition: null,
    weight_gsm: null,
    paired_suit_line_id: "line-1781346044433-13",
  },
  {
    id: "line-1781346098118-14-tr",
    article: 17,
    fabric_number: "10025.015/12",
    color: "Black",
    composition: "SUPER150SW 100%",
    weight_gsm: 265,
    paired_suit_line_id: "line-1781346098118-14",
  },
  {
    id: "line-1781346204015-15-tr",
    article: 18,
    fabric_number: "10577.001/4",
    color: "Blue dark",
    composition: "SUPER180S W100%",
    weight_gsm: 265,
    paired_suit_line_id: "line-1781346204015-15",
  },
];

const SUIT_LINE_IDS = [
  "line-1781346044433-13",
  "line-1781346098118-14",
  "line-1781346204015-15",
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

function suitStickers(article) {
  const linePart = `L${String(article).padStart(2, "0")}`;
  return [
    {
      code: `${CLIENT_REF}-${linePart}-JKT`,
      piece_name: "Jacket",
      sequence: 1,
    },
    {
      code: `${CLIENT_REF}-${linePart}-TR`,
      piece_name: "Trouser",
      sequence: 2,
    },
  ];
}

function trouserStickers(article) {
  const linePart = `L${String(article).padStart(2, "0")}`;
  return [
    {
      code: `${CLIENT_REF}-${linePart}-TR`,
      piece_name: "Trouser",
      sequence: 1,
    },
  ];
}

function makeTrouserLine(spec, suitLine) {
  const label_stickers = trouserStickers(spec.article);
  return {
    id: spec.id,
    garment_type: "Trouser",
    label_count: 1,
    label_stickers,
    supplier_id: suitLine.supplier_id,
    supplier_name: suitLine.supplier_name,
    fabric_number: spec.fabric_number,
    quantity: suitLine.quantity ?? 3,
    unit: "meters",
    unit_price: 0,
    composition: spec.composition ?? suitLine.composition ?? null,
    weight_gsm: spec.weight_gsm ?? suitLine.weight_gsm ?? null,
    width_cm: suitLine.width_cm ?? null,
    width_inches: suitLine.width_inches ?? null,
    color: spec.color ?? suitLine.color ?? null,
    needs_replacement: false,
    replacement_fabric_number: null,
  };
}

function articleFromSuitLine(line) {
  const code = line.label_stickers?.[0]?.code ?? "";
  const match = code.match(/-L(\d{2})-/);
  return match ? Number.parseInt(match[1], 10) : null;
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
  if (error) throw new Error(`Supabase upsert ${id} failed: ${error.message}`);
  return payload;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) throw new Error("Missing Supabase credentials");

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const soStore = await fetchDoc(admin, "sales_orders");
  const pjStore = await fetchDoc(admin, "pattern_jobs");

  const orderIndex = soStore.orders.findIndex((o) => o.id === SO_ID);
  if (orderIndex < 0) throw new Error(`${SO_NUMBER} not found`);

  const order = soStore.orders[orderIndex];
  const suitById = new Map(order.fabric_lines.map((l) => [l.id, l]));
  const existingIds = new Set(order.fabric_lines.map((l) => l.id));

  const fixedSuits = [];
  for (const lineId of SUIT_LINE_IDS) {
    const line = suitById.get(lineId);
    if (!line) throw new Error(`Missing suit line ${lineId}`);
    const article = articleFromSuitLine(line);
    if (article == null) throw new Error(`No article on suit line ${lineId}`);
    const label_stickers = suitStickers(article);
    Object.assign(line, {
      garment_type: "Suit",
      label_count: 2,
      label_stickers,
    });
    fixedSuits.push({ id: lineId, article, fabric: line.fabric_number, stickers: label_stickers.map((s) => s.code) });
  }

  const addedTrousers = [];
  const newTrouserLines = [];
  for (const spec of TROUSER_LINES) {
    if (existingIds.has(spec.id)) continue;
    const suitLine = suitById.get(spec.paired_suit_line_id);
    if (!suitLine) throw new Error(`Paired suit missing: ${spec.paired_suit_line_id}`);
    const trouserLine = makeTrouserLine(spec, suitLine);
    newTrouserLines.push({ spec, line: trouserLine, insertBefore: spec.paired_suit_line_id });
    addedTrousers.push({
      id: spec.id,
      article: spec.article,
      fabric: spec.fabric_number,
      sticker: trouserLine.label_stickers[0].code,
    });
  }

  const fabric_lines = [];
  for (const line of order.fabric_lines) {
    const inserts = newTrouserLines.filter((t) => t.insertBefore === line.id);
    for (const { line: trouserLine } of inserts) {
      fabric_lines.push(trouserLine);
    }
    fabric_lines.push(line);
  }

  soStore.orders[orderIndex] = { ...order, fabric_lines };
  await syncDoc(admin, "sales_orders", soStore);
  writeFileSync(resolve("src/data/sales-orders.json"), `${JSON.stringify(soStore, null, 2)}\n`);

  const now = new Date().toISOString();
  const addedJobs = [];
  const existingJobs = pjStore.jobs.filter((j) => j.sales_order_id === SO_ID && j.status !== "cancelled");

  for (const { spec, line: trouserLine } of newTrouserLines) {
    const suitJob = existingJobs.find((j) => j.sales_order_line_id === spec.paired_suit_line_id);
    const job = {
      id: `pj-${Date.now()}-${spec.article}-tr`,
      sales_order_id: SO_ID,
      sales_order_line_id: spec.id,
      so_number: SO_NUMBER,
      client_id: order.client_id,
      client_name: order.client_name,
      client_code: order.client_code,
      garment_type: "Trouser",
      piece_name: "Trouser",
      article_number: spec.article,
      fabric_number: spec.fabric_number,
      supplier: trouserLine.supplier_name,
      composition: trouserLine.composition,
      gsm: trouserLine.weight_gsm,
      width_cm: trouserLine.width_cm,
      width_inches: trouserLine.width_inches,
      color: trouserLine.color,
      meters: trouserLine.quantity,
      status: "pending",
      assigned_to: null,
      pattern_code: null,
      pattern_size_notes: null,
      trial_priority: false,
      blocked_reason: null,
      notes: null,
      fittings: [],
      revisions: [],
      created_at: now,
      updated_at: now,
    };
    pjStore.jobs.unshift(job);
    addedJobs.push({ id: job.id, article: spec.article, fabric: spec.fabric_number, line: spec.id });
  }

  for (const lineId of SUIT_LINE_IDS) {
    const line = fabric_lines.find((l) => l.id === lineId);
    const job = existingJobs.find((j) => j.sales_order_line_id === lineId);
    if (job && line) {
      const idx = pjStore.jobs.findIndex((j) => j.id === job.id);
      if (idx >= 0) {
        pjStore.jobs[idx] = {
          ...pjStore.jobs[idx],
          piece_name: "Jacket",
          garment_type: "Suit",
          updated_at: now,
        };
      }
    }
  }

  await syncDoc(admin, "pattern_jobs", pjStore);
  writeFileSync(resolve("src/data/pattern-jobs.json"), `${JSON.stringify(pjStore, null, 2)}\n`);

  const finalOrder = soStore.orders[orderIndex];
  const suitSummary = finalOrder.fabric_lines
    .filter((l) => l.garment_type === "Suit" || l.garment_type === "Trouser")
    .map((l) => ({
      id: l.id,
      garment: l.garment_type,
      fabric: l.fabric_number,
      labels: l.label_stickers?.map((s) => s.code),
    }));

  console.log(
    JSON.stringify(
      {
        so_number: SO_NUMBER,
        fabric_lines_before: order.fabric_lines.length,
        fabric_lines_after: fabric_lines.length,
        fixed_suit_lines: fixedSuits,
        added_trouser_lines: addedTrousers,
        added_pattern_jobs: addedJobs,
        suit_trouser_lines_now: suitSummary,
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
