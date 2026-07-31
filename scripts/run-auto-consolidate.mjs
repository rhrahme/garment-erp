#!/usr/bin/env node
/**
 * Apply pattern auto-consolidate (composition + gsm + garment) to all clients on Supabase.
 *
 * Usage (loader resolves extensionless .ts):
 *   node --experimental-strip-types --experimental-loader /tmp/ts-resolve-loader.mjs \
 *     scripts/run-auto-consolidate.mjs --dry-run
 *   node --experimental-strip-types --experimental-loader /tmp/ts-resolve-loader.mjs \
 *     scripts/run-auto-consolidate.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { planAutoConsolidate } from "../src/lib/pattern/auto-consolidate-grouping.ts";
import { normalizePatternSheetGarment } from "../src/lib/pattern-library/base-pattern-picker.ts";

function buildMeasurementsFromTemplate(dictionary, garmentType) {
  const points = (dictionary ?? []).filter((point) =>
    (point.garment_types ?? []).some(
      (type) => String(type).toLowerCase() === String(garmentType).toLowerCase()
    )
  );
  return points.map((point) => ({
    point_id: point.id,
    name: point.name,
    remark: null,
    is_graded: true,
    base_value: null,
    target_value: null,
    sewn_value: null,
    adjustment: null,
    remarks: null,
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
  const dryRun = !apply;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [jobsDoc, ordersDoc, libraryDoc] = await Promise.all([
    fetchDoc(admin, "pattern_jobs"),
    fetchDoc(admin, "sales_orders"),
    fetchDoc(admin, "pattern_library"),
  ]);

  const plan = planAutoConsolidate({
    jobs: jobsDoc.jobs ?? [],
    orders: ordersDoc.orders ?? [],
    clientPatterns: libraryDoc.client_patterns ?? [],
  });

  const actionable = plan.groups.filter((g) => g.action !== "noop");
  const preview = {
    dry_run: dryRun,
    groups_formed: plan.groups.length,
    actionable: actionable.length,
    noop: plan.groups.filter((g) => g.action === "noop").length,
    skipped_incomplete_key: plan.skipped_incomplete_key,
    skipped_cancelled_or_orphan: plan.skipped_cancelled_or_orphan,
    cross_client_fit_families: plan.cross_client_fit_families.length,
    sample_actions: actionable.slice(0, 15).map((g) => ({
      client: g.client_name,
      garment: g.garment_type,
      composition: g.composition_display,
      gsm: g.weight_gsm,
      jobs: g.job_ids.length,
      action: g.action,
      pattern: g.preferred_pattern_id,
    })),
  };
  console.log(JSON.stringify(preview, null, 2));
  const planPath = `/tmp/auto-consolidate-plan-${Date.now()}.json`;
  writeFileSync(planPath, JSON.stringify(plan, null, 2));
  console.log(`Plan: ${planPath}`);

  if (dryRun) {
    console.log("Dry run only. Re-run with --apply to write to production.");
    return;
  }

  let jobs_linked = 0;
  let patterns_created = 0;
  let patterns_reused = 0;
  const linked_job_ids = [];
  const created_pattern_ids = [];
  const now = nowIso();

  const jobsById = new Map((jobsDoc.jobs ?? []).map((j) => [j.id, j]));
  const patternsById = new Map((libraryDoc.client_patterns ?? []).map((p) => [p.id, p]));
  const dictionary = libraryDoc.dictionary ?? [];

  for (const group of plan.groups) {
    if (group.action === "noop") continue;

    let patternId = group.preferred_pattern_id;
    let pattern = patternId ? patternsById.get(patternId) : null;

    if (group.action === "create" || !pattern) {
      const garmentType = normalizePatternSheetGarment(group.garment_type) || group.garment_type;
      patternId = `cp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const measurements = buildMeasurementsFromTemplate(dictionary, garmentType);
      const version = {
        id: `cpv-${Date.now()}-1`,
        version: 1,
        is_final: false,
        trial_date: null,
        measurements,
        special_instructions: null,
        notes: null,
        files: [],
        created_by: "script:run-auto-consolidate",
        updated_by: "script:run-auto-consolidate",
        created_at: now,
        updated_at: now,
      };
      pattern = {
        id: patternId,
        pattern_ref: `${group.client_code}-${garmentType}`.replace(/\s+/g, "-").slice(0, 48),
        client_id: group.client_id,
        client_code: group.client_code,
        client_name: group.client_name,
        garment_type: garmentType,
        description: null,
        base_pattern_id: null,
        base_size: null,
        house_brand_id: null,
        house_brand_code: null,
        fabric: group.composition_display || null,
        unit: "cm",
        versions: [version],
        final_version_id: null,
        special_instructions: null,
        physical_pattern_kept: false,
        physical_pattern_location: null,
        files: [],
        linked_fabric_line_ids: [...group.line_ids],
        linked_fabric_refs: [],
        notes: `Auto-consolidated: ${group.composition_display} ${group.weight_gsm} gsm`,
        created_at: now,
        updated_at: now,
      };
      libraryDoc.client_patterns.push(pattern);
      patternsById.set(patternId, pattern);
      patterns_created += 1;
      created_pattern_ids.push(patternId);
      // avoid identical timestamps colliding ids
      await new Promise((r) => setTimeout(r, 2));
    } else {
      const linked = new Set(pattern.linked_fabric_line_ids ?? []);
      for (const lineId of group.line_ids) linked.add(lineId);
      pattern.linked_fabric_line_ids = [...linked];
      pattern.updated_at = now;
      patterns_reused += 1;
    }

    const versionId = pattern.versions?.[0]?.id ?? null;
    for (const jobId of group.job_ids) {
      const job = jobsById.get(jobId);
      if (!job) continue;
      if (job.client_pattern_id === patternId) continue;
      job.client_pattern_id = patternId;
      if (versionId) job.client_pattern_version_id = versionId;
      job.updated_at = now;
      jobs_linked += 1;
      linked_job_ids.push(jobId);
    }
  }

  libraryDoc.updated_at = now;
  jobsDoc.updated_at = now;

  await syncDoc(admin, "pattern_library", libraryDoc, "src/data/pattern-library.json");
  await syncDoc(admin, "pattern_jobs", jobsDoc, "src/data/pattern-jobs.json");

  const summary = {
    dry_run: false,
    groups_formed: plan.groups.length,
    jobs_linked,
    patterns_created,
    patterns_reused,
    linked_job_ids,
    created_pattern_ids,
    cross_client_fit_families: plan.cross_client_fit_families.length,
  };
  const out = `/tmp/auto-consolidate-apply-${Date.now()}.json`;
  writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Applied. Log: ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
