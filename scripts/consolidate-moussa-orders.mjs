#!/usr/bin/env node
/**
 * Consolidate Abdullah Al Moussa duplicate sales orders into SO-2026-0109.
 * Removes SO-2026-0107 and SO-2026-0108 (subsets / orphans), cancels their pattern jobs.
 * Preserves SO-2026-0109 with all 33 fabric lines and sent fabric POs.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CLIENT_ID = "cu-abdullah-al-moussa-fouad-rahme";
const KEEP_SO = "SO-2026-0109";
const REMOVE_SOS = ["SO-2026-0107", "SO-2026-0108"];
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

async function main() {
  const soPath = resolve("src/data/sales-orders.json");
  const pjPath = resolve("src/data/pattern-jobs.json");
  const now = new Date().toISOString();

  const soStore = JSON.parse(readFileSync(soPath, "utf8"));
  const pjStore = JSON.parse(readFileSync(pjPath, "utf8"));

  const keepOrder = soStore.orders.find((o) => o.so_number === KEEP_SO);
  if (!keepOrder) throw new Error(`Canonical order ${KEEP_SO} not found`);
  if (keepOrder.client_id !== CLIENT_ID) throw new Error(`${KEEP_SO} is not for Moussa`);

  const removed = [];
  const removeIds = new Set();

  for (const soNumber of REMOVE_SOS) {
    const order = soStore.orders.find((o) => o.so_number === soNumber);
    if (!order) {
      console.log(`${soNumber} not found — already removed`);
      continue;
    }
    if (order.client_id !== CLIENT_ID) {
      throw new Error(`${soNumber} is not for Moussa — aborting`);
    }
    if (order.fabric_po_ids?.length > 0) {
      throw new Error(`${soNumber} has fabric POs — aborting to preserve PO history`);
    }
    removed.push({
      so_number: order.so_number,
      id: order.id,
      lines: order.fabric_lines.length,
      status: order.status,
    });
    removeIds.add(order.id);
  }

  soStore.orders = soStore.orders.filter((o) => !removeIds.has(o.id));
  soStore.updated_at = now;
  writeFileSync(soPath, `${JSON.stringify(soStore, null, 2)}\n`);

  let cancelledJobs = 0;
  const jobsToCancel = [];
  for (const job of pjStore.jobs) {
    if (!removeIds.has(job.sales_order_id)) continue;
    if (job.status === "cancelled" || job.status === "completed") continue;
    jobsToCancel.push(job.id);
  }

  if (jobsToCancel.length > 0 && !force) {
    throw new Error(
      `Would cancel ${jobsToCancel.length} pattern job(s): ${jobsToCancel.join(", ")}. Re-run with --force to confirm.`
    );
  }

  for (const job of pjStore.jobs) {
    if (!removeIds.has(job.sales_order_id)) continue;
    if (job.status === "cancelled" || job.status === "completed") continue;
    job.status = "cancelled";
    job.updated_at = now;
    cancelledJobs += 1;
  }
  pjStore.updated_at = now;
  writeFileSync(pjPath, `${JSON.stringify(pjStore, null, 2)}\n`);

  loadEnvLocal();
  await syncDoc("sales_orders", soStore);
  await syncDoc("pattern_jobs", pjStore);

  const remaining = soStore.orders.filter((o) => o.client_id === CLIENT_ID);
  const recent = remaining.filter((o) =>
    [KEEP_SO, ...REMOVE_SOS].includes(o.so_number)
  );

  console.log(
    JSON.stringify(
      {
        removed,
        cancelled_pattern_jobs: cancelledJobs,
        canonical: {
          so_number: keepOrder.so_number,
          id: keepOrder.id,
          lines: keepOrder.fabric_lines.length,
          status: keepOrder.status,
          fabric_po_ids: keepOrder.fabric_po_ids?.length ?? 0,
        },
        moussa_orders_remaining: remaining.map((o) => ({
          so_number: o.so_number,
          lines: o.fabric_lines.length,
          status: o.status,
        })),
        recent_moussa_check: recent.map((o) => o.so_number),
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
