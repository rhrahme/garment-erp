#!/usr/bin/env node
/**
 * Repair SO-2026-0133 Overshirt+Trouser SUMMERTIME 250gsm sheet:
 * - Pattern typed CM (76, 63, 66.5...) but auto-consolidate stamped unit "in"
 *   without converting -> relabel to "cm" (numbers unchanged).
 * - Jobs were pointed at Abd Nayan shirt inch sheet -> relink to the OT sheet.
 *
 *   node scripts/fix-khaled-ot-cm-unit-relink.mjs
 *   node scripts/fix-khaled-ot-cm-unit-relink.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SO_NUMBER = "SO-2026-0133";
const OT_PATTERN_ID = "cp-1785530548415-8690";
const COMPOSITION = '71% WOOL 15% SILK 14% LINEN "SUMMERTIME"';
const GSM = 250;

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
  const [library, jobsFile, ordersFile] = await Promise.all([
    fetchDoc(admin, "pattern_library"),
    fetchDoc(admin, "pattern_jobs"),
    fetchDoc(admin, "sales_orders"),
  ]);

  const so = (ordersFile.orders ?? []).find((order) => order.so_number === SO_NUMBER);
  if (!so) throw new Error(`${SO_NUMBER} not found`);
  const linesById = new Map((so.fabric_lines ?? []).map((line) => [line.id, line]));

  const pattern = (library.client_patterns ?? []).find((row) => row.id === OT_PATTERN_ID);
  if (!pattern) throw new Error(`Pattern ${OT_PATTERN_ID} not found`);

  const otJobs = (jobsFile.jobs ?? []).filter((job) => {
    if (job.sales_order_id !== so.id) return false;
    if (!/overshirt\+trouser/i.test(job.garment_type || "")) return false;
    const line = linesById.get(job.sales_order_line_id);
    const composition = line?.composition || job.composition || "";
    const gsm = line?.weight_gsm ?? job.gsm ?? job.weight_gsm;
    return composition === COMPOSITION && Number(gsm) === GSM;
  });

  const lineIds = [...new Set(otJobs.map((job) => job.sales_order_line_id).filter(Boolean))];
  const jobIds = otJobs.map((job) => job.id);

  console.log("Pattern", pattern.pattern_ref, "unit=", pattern.unit, "-> cm (relabel, no convert)");
  console.log(
    "Jobs to relink",
    otJobs.length,
    otJobs.map((j) => `L${j.article_number}:${j.fabric_number}`).join(", ")
  );
  console.log("Line ids", lineIds.length);

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write Supabase.");
    return;
  }

  const stamp = nowIso();
  library.client_patterns = (library.client_patterns ?? []).map((row) => {
    if (row.id !== OT_PATTERN_ID) {
      // Drop these line ids from other same-client patterns' link lists.
      const linked = row.linked_fabric_line_ids ?? [];
      if (row.client_id !== so.client_id || linked.length === 0) return row;
      const nextLinked = linked.filter((id) => !lineIds.includes(id));
      if (nextLinked.length === linked.length) return row;
      return {
        ...row,
        linked_fabric_line_ids: nextLinked,
        updated_at: stamp,
      };
    }
    const prevLinked = row.linked_fabric_line_ids ?? [];
    const merged = [...new Set([...prevLinked, ...lineIds])];
    return {
      ...row,
      unit: "cm",
      linked_fabric_line_ids: merged,
      updated_at: stamp,
    };
  });

  jobsFile.jobs = (jobsFile.jobs ?? []).map((job) => {
    if (!jobIds.includes(job.id)) return job;
    return {
      ...job,
      client_pattern_id: OT_PATTERN_ID,
      updated_at: stamp,
    };
  });

  await syncDoc(admin, "pattern_library", library, "src/data/pattern-library.json");
  await syncDoc(admin, "pattern_jobs", jobsFile, "src/data/pattern-jobs.json");
  console.log("\nApplied: unit=cm +", jobIds.length, "jobs relinked to", OT_PATTERN_ID);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
