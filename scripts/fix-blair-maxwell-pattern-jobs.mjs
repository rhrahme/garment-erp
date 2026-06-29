#!/usr/bin/env node
/**
 * Fix Blair Maxwell (GL-0526-0002 / SO-2026-0005):
 * - Sales order has 4 fabric lines but 13 pattern jobs remain from an older 13-line import
 * - Cancel orphaned pattern jobs and realign the 4 active jobs to current SO lines
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SO_ID = "so-cu-86exhyjr1";
const SO_NUMBER = "SO-2026-0005";
const force = process.argv.includes("--force");

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

function fabricLineArticleNumber(index) {
  return index + 1;
}

function pieceNameForLine(line) {
  const sticker = line.label_stickers?.[0];
  if (sticker?.piece_name) return sticker.piece_name;
  return line.garment_type;
}

function jobFieldsFromLine(order, line, articleNumber) {
  return {
    sales_order_id: order.id,
    sales_order_line_id: line.id,
    so_number: order.so_number,
    client_id: order.client_id,
    client_name: order.client_name,
    client_code: order.client_code,
    garment_type: line.garment_type,
    piece_name: pieceNameForLine(line),
    article_number: articleNumber,
    fabric_number: line.fabric_number,
    supplier: line.supplier_name,
    composition: line.composition,
    gsm: line.weight_gsm,
    width_cm: line.width_cm,
    width_inches: line.width_inches,
    color: line.color,
    meters: line.quantity,
  };
}

async function fetchDoc(admin, id) {
  const { data, error } = await admin.from("erp_documents").select("data").eq("id", id).single();
  if (error) throw new Error(`Fetch ${id}: ${error.message}`);
  return data.data;
}

async function syncDoc(admin, id, data) {
  const updated_at = new Date().toISOString();
  const payload = { ...data, updated_at: data.updated_at ?? updated_at };
  const { error } = await admin.from("erp_documents").upsert(
    { id, data: payload, updated_at },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Supabase upsert ${id} failed: ${error.message}`);
  return payload;
}

function syncPatternJobsFromSalesOrder(store, order) {
  const now = new Date().toISOString();
  const created = [];
  const updated = [];
  const cancelled = [];

  const existingForOrder = store.jobs.filter((job) => job.sales_order_id === order.id);
  const lineIds = new Set(order.fabric_lines.map((line) => line.id));

  for (const [index, line] of order.fabric_lines.entries()) {
    const articleNumber = fabricLineArticleNumber(index);
    const fields = jobFieldsFromLine(order, line, articleNumber);
    const existing = existingForOrder.find((job) => job.sales_order_line_id === line.id);

    if (existing) {
      const wasCancelled = existing.status === "cancelled";
      const nextStatus =
        wasCancelled && lineIds.has(line.id)
          ? "pending"
          : existing.status === "cancelled"
            ? "cancelled"
            : existing.status;

      const nextJob = {
        ...existing,
        ...fields,
        status: nextStatus,
        updated_at: now,
      };

      const changed =
        existing.fabric_number !== nextJob.fabric_number ||
        existing.garment_type !== nextJob.garment_type ||
        existing.meters !== nextJob.meters ||
        existing.supplier !== nextJob.supplier ||
        existing.article_number !== nextJob.article_number ||
        wasCancelled;

      if (changed) updated.push(existing.id);

      const jobIndex = store.jobs.findIndex((job) => job.id === existing.id);
      if (jobIndex >= 0) store.jobs[jobIndex] = nextJob;
    } else {
      const id = `pj-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      const job = {
        id,
        ...fields,
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
      store.jobs.unshift(job);
      created.push(id);
    }
  }

  for (const job of existingForOrder) {
    if (lineIds.has(job.sales_order_line_id)) continue;
    if (job.status === "cancelled" || job.status === "completed") continue;

    const jobIndex = store.jobs.findIndex((item) => item.id === job.id);
    if (jobIndex < 0) continue;

    store.jobs[jobIndex] = {
      ...store.jobs[jobIndex],
      status: "cancelled",
      updated_at: now,
    };
    cancelled.push(job.id);
  }

  store.updated_at = now;
  return { created, updated, cancelled };
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) throw new Error("Missing Supabase credentials in .env.local");

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const soStore = await fetchDoc(admin, "sales_orders");
  const pjStore = await fetchDoc(admin, "pattern_jobs");

  const order = soStore.orders.find((o) => o.id === SO_ID || o.so_number === SO_NUMBER);
  if (!order) throw new Error(`${SO_NUMBER} not found`);

  const before = pjStore.jobs.filter(
    (j) => j.sales_order_id === order.id && j.status !== "cancelled"
  );

  const result = syncPatternJobsFromSalesOrder(pjStore, order);

  if (result.cancelled.length > 0 && !force) {
    throw new Error(
      `Would cancel ${result.cancelled.length} pattern job(s): ${result.cancelled.join(", ")}. Re-run with --force to confirm.`
    );
  }

  const after = pjStore.jobs.filter(
    (j) => j.sales_order_id === order.id && j.status !== "cancelled"
  );

  await syncDoc(admin, "pattern_jobs", pjStore);

  const pjPath = resolve("src/data/pattern-jobs.json");
  writeFileSync(pjPath, `${JSON.stringify(pjStore, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        client: order.client_name,
        client_code: order.client_code,
        so_number: order.so_number,
        so_fabric_lines: order.fabric_lines.length,
        pattern_jobs_before: before.length,
        pattern_jobs_after: after.length,
        cancelled: result.cancelled,
        updated: result.updated,
        created: result.created,
        active_jobs: after.map((j) => ({
          id: j.id,
          article: j.article_number,
          garment: j.garment_type,
          fabric: j.fabric_number,
          so_line: j.sales_order_line_id,
        })),
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
