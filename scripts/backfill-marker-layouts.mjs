#!/usr/bin/env node
/**
 * Backfill marker width + approximate nest layout for patterns that already have a TUD.
 * No re-upload required.
 *
 * Usage:
 *   export PATH="/tmp/node-portable/node-v22.14.0-darwin-x64/bin:$PATH"
 *   node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs \
 *     scripts/backfill-marker-layouts.mjs --dry-run
 *   node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs \
 *     scripts/backfill-marker-layouts.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  backfillMarkerLayoutsForPatterns,
} from "../src/lib/pattern-library/marker-layout-backfill.ts";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function nowIso() {
  return new Date().toISOString();
}

async function fetchDoc(admin, id) {
  const { data, error } = await admin.from("erp_documents").select("data").eq("id", id).single();
  if (error) throw new Error(`Fetch ${id}: ${error.message}`);
  return data.data;
}

async function syncDoc(admin, id, data, localPath) {
  const updated_at = nowIso();
  const payload = { ...data, updated_at };
  const { error } = await admin
    .from("erp_documents")
    .upsert({ id, data: payload, updated_at }, { onConflict: "id" });
  if (error) throw new Error(`Supabase upsert ${id} failed: ${error.message}`);
  if (localPath) writeFileSync(localPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

async function main() {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const [library, salesOrders, patternJobs] = await Promise.all([
    fetchDoc(admin, "pattern_library"),
    fetchDoc(admin, "sales_orders"),
    fetchDoc(admin, "pattern_jobs"),
  ]);

  const hintsByPatternId = {};
  for (const job of patternJobs.jobs ?? []) {
    if (!job.client_pattern_id) continue;
    if (!(typeof job.width_cm === "number" && job.width_cm > 0)) continue;
    const list = hintsByPatternId[job.client_pattern_id] ?? [];
    list.push(job.width_cm);
    hintsByPatternId[job.client_pattern_id] = list;
  }

  const summary = backfillMarkerLayoutsForPatterns(library.client_patterns ?? [], {
    updated_at: nowIso(),
    salesOrders: salesOrders.orders ?? [],
    hintsByPatternId,
  });

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        patterns: (library.client_patterns ?? []).length,
        seeded_layout: summary.seeded_layout,
        filled_width: summary.filled_width,
        skipped_no_tud: summary.skipped_no_tud,
        skipped_no_width: summary.skipped_no_width,
        unchanged: summary.unchanged,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write Supabase + local JSON.");
    return;
  }

  library.client_patterns = summary.patterns;
  await syncDoc(
    admin,
    "pattern_library",
    library,
    resolve(process.cwd(), "src/data/pattern-library.json")
  );
  console.log("Applied marker layout backfill to pattern_library.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
