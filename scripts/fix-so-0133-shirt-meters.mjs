#!/usr/bin/env node
/**
 * SO-2026-0133: bump Shirt LS fabric lines from 1.72m to 1.8m (safety margin).
 *
 * Fetches sales_orders (+ linked pattern_jobs meters) from Supabase, patches matching
 * shirt-only lines, writes local JSON + upserts erp_documents, then notifies Zapier.
 *
 *   node scripts/fix-so-0133-shirt-meters.mjs
 *   node scripts/fix-so-0133-shirt-meters.mjs --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SO_NUMBER = "SO-2026-0133";
const OLD_METERS = 1.72;
const NEW_METERS = 1.8;
const SO_LOCAL_PATH = "src/data/sales-orders.json";
const PJ_LOCAL_PATH = "src/data/pattern-jobs.json";
const TOLERANCE = 0.005;

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

function isShirtOnlyGarment(garmentType) {
  const g = String(garmentType ?? "").trim().toLowerCase();
  if (!g) return false;
  if (g.includes("+")) return false; // Shirt+Trouser etc.
  return g.startsWith("shirt");
}

function approxMeters(qty, target) {
  const n = Number(qty);
  return Number.isFinite(n) && Math.abs(n - target) <= TOLERANCE;
}

async function notifyZapier(event, data) {
  const url = process.env.ZAPIER_WEBHOOK_URL?.trim();
  if (!url) {
    console.warn("No ZAPIER_WEBHOOK_URL - skipping Zapier notify");
    return false;
  }
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    source: "erp",
    data: { ...data, _source: "erp" },
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.error("Zapier webhook HTTP error:", response.status, await response.text());
    return false;
  }
  return true;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) throw new Error("Missing Supabase credentials in .env.local");

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: soRow, error: soError } = await admin
    .from("erp_documents")
    .select("data")
    .eq("id", "sales_orders")
    .single();
  if (soError) throw new Error(`Fetch sales_orders: ${soError.message}`);

  const soStore = soRow.data;
  const order = (soStore.orders ?? []).find((o) => o.so_number === SO_NUMBER);
  if (!order) throw new Error(`${SO_NUMBER} not found in erp_documents.sales_orders`);

  const changed = [];
  for (const line of order.fabric_lines ?? []) {
    if (!isShirtOnlyGarment(line.garment_type)) continue;
    if (!approxMeters(line.quantity, OLD_METERS)) continue;
    const oldQty = line.quantity;
    if (!dryRun) line.quantity = NEW_METERS;
    changed.push({
      line_id: line.id,
      fabric_number: line.fabric_number,
      garment_type: line.garment_type,
      old_meters: oldQty,
      new_meters: NEW_METERS,
    });
  }

  const lineIds = new Set(
    (order.fabric_lines ?? [])
      .filter((line) => isShirtOnlyGarment(line.garment_type) && approxMeters(line.quantity, NEW_METERS))
      .map((line) => line.id)
      .concat(changed.map((c) => c.line_id))
  );

  const { data: pjRow, error: pjError } = await admin
    .from("erp_documents")
    .select("data")
    .eq("id", "pattern_jobs")
    .single();
  if (pjError) throw new Error(`Fetch pattern_jobs: ${pjError.message}`);

  const pjStore = pjRow.data;
  const patternChanged = [];
  for (const job of pjStore.jobs ?? []) {
    if (job.sales_order_id !== order.id) continue;
    if (!lineIds.has(job.sales_order_line_id) && !changed.some((c) => c.line_id === job.sales_order_line_id)) {
      continue;
    }
    if (!approxMeters(job.meters, OLD_METERS)) continue;
    patternChanged.push({
      job_id: job.id,
      fabric_number: job.fabric_number,
      garment_type: job.garment_type,
      old_meters: job.meters,
      new_meters: NEW_METERS,
    });
    if (!dryRun) {
      job.meters = NEW_METERS;
      job.updated_at = new Date().toISOString();
    }
  }

  if (changed.length === 0 && patternChanged.length === 0) {
    console.log(
      JSON.stringify(
        { so_number: SO_NUMBER, changed: [], pattern_jobs: [], note: "already at 1.8m / nothing to update" },
        null,
        2
      )
    );
    return;
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        { dry_run: true, so_number: SO_NUMBER, order_id: order.id, changed, pattern_jobs: patternChanged },
        null,
        2
      )
    );
    return;
  }

  const updated_at = new Date().toISOString();
  soStore.updated_at = updated_at;
  pjStore.updated_at = updated_at;

  if (changed.length > 0) {
    writeFileSync(resolve(process.cwd(), SO_LOCAL_PATH), `${JSON.stringify(soStore, null, 2)}\n`, "utf8");
    const { error: upsertSo } = await admin.from("erp_documents").upsert(
      { id: "sales_orders", data: soStore, updated_at },
      { onConflict: "id" }
    );
    if (upsertSo) throw new Error(`Upsert sales_orders: ${upsertSo.message}`);
  }

  if (patternChanged.length > 0) {
    writeFileSync(resolve(process.cwd(), PJ_LOCAL_PATH), `${JSON.stringify(pjStore, null, 2)}\n`, "utf8");
    const { error: upsertPj } = await admin.from("erp_documents").upsert(
      { id: "pattern_jobs", data: pjStore, updated_at },
      { onConflict: "id" }
    );
    if (upsertPj) throw new Error(`Upsert pattern_jobs: ${upsertPj.message}`);
  }

  const zapierOk =
    changed.length > 0
      ? await notifyZapier("sales_order.fabric_lines_updated", {
          order_id: order.id,
          so_number: order.so_number,
          line_ids: changed.map((c) => c.line_id),
          updated_count: changed.length,
          updated_by: "script:fix-so-0133-shirt-meters",
          changes: changed,
        })
      : false;

  console.log(
    JSON.stringify(
      {
        so_number: SO_NUMBER,
        order_id: order.id,
        production_updated: true,
        local_updated: true,
        zapier_notified: zapierOk,
        changed,
        pattern_jobs: patternChanged,
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
