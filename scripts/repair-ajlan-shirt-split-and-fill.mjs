/**
 * One-off repair after zipfile import:
 * 1) Split mixed cotton+loro shirt pattern into two patterns
 * 2) Re-fill measurement Size columns from attached / source xlsx
 * 3) Persist pattern_library to Supabase + local JSON
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const LIBRARY_PATH = resolve("src/data/pattern-library.json");
const XLSX_PARSER = resolve("scripts/lib/parse-client-measurement-xlsx.py");
const CLIENT_CODE = "FR-0726-0039";
const MIXED_ID = "cp-1785002473566-7";
const SOURCE_ROOT = "/Users/ralphrahme/Downloads/zipfiletrialandfinal_/Abdel Aziz Mohamad Al Ajlan";

function loadEnv() {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

function nowIso() {
  return new Date().toISOString();
}

function parseXlsx(path) {
  const res = spawnSync("python3", [XLSX_PARSER, path], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(res.stderr || res.stdout);
  const data = JSON.parse(res.stdout);
  return Array.isArray(data) ? data[0] : data;
}

function pointsToMeasurements(points) {
  return (points || []).map((point) => ({
    point_id: point.point_id,
    name: point.name,
    remark: null,
    is_graded: true,
    base_value: point.base_value ?? null,
    target_value: point.target_value ?? point.base_value ?? null,
    sewn_value: point.final_value ?? point.trial_values?.["1"] ?? null,
    adjustment: null,
    remarks: point.remarks ?? null,
  }));
}

function isCottonName(name) {
  return /cotton/i.test(name) && !/loro|lora|linen|knit/i.test(name);
}
function isLinenName(name) {
  return /loro|lora|linen/i.test(name);
}

function findSourceXlsx(filename) {
  const res = spawnSync(
    "find",
    [SOURCE_ROOT, "-type", "f", "-name", filename],
    { encoding: "utf8" }
  );
  const lines = (res.stdout || "").split("\n").filter(Boolean);
  return lines[0] || null;
}

function fillFromBestXlsx(pattern, prefer = "final") {
  const xlsxs = [
    ...(pattern.files || []).filter((f) => f.kind === "xlsx"),
    ...(pattern.versions || []).flatMap((v) => (v.files || []).filter((f) => f.kind === "xlsx")),
  ];
  if (!xlsxs.length) return { filled: 0, source: null };

  const scored = xlsxs.map((f) => {
    const n = f.filename.toLowerCase();
    let score = 0;
    if (prefer === "final" && n.includes("final")) score += 2;
    if (prefer === "trial" && n.includes("trial")) score += 2;
    if (!/\b(n\d{5,}|ns\d+|s\d{4,})\b/i.test(f.filename)) score += 1;
    return { f, score };
  });
  scored.sort((a, b) => b.score - a.score);

  for (const { f } of scored) {
    const path = findSourceXlsx(f.filename);
    if (!path) continue;
    try {
      const parsed = parseXlsx(path);
      if (!parsed?.ok || !parsed.points?.length) continue;
      const target =
        pattern.versions.find((v) => v.id === pattern.final_version_id) ||
        pattern.versions[pattern.versions.length - 1];
      target.measurements = pointsToMeasurements(parsed.points);
      target.special_instructions = parsed.special_instructions || target.special_instructions;
      target.updated_at = nowIso();
      if (parsed.unit) pattern.unit = parsed.unit;
      if (parsed.pattern_ref && (!pattern.pattern_ref || /CUSTOM/i.test(pattern.pattern_ref))) {
        pattern.pattern_ref = parsed.pattern_ref.trim();
      }
      pattern.updated_at = nowIso();
      return { filled: parsed.filled_count || parsed.points.length, source: f.filename };
    } catch (err) {
      console.warn(`parse fail ${f.filename}: ${err.message}`);
    }
  }
  return { filled: 0, source: null };
}

async function main() {
  loadEnv();
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: remoteRow, error } = await admin
    .from("erp_documents")
    .select("data, updated_at")
    .eq("id", "pattern_library")
    .maybeSingle();
  if (error) throw error;

  const store = remoteRow?.data || JSON.parse(readFileSync(LIBRARY_PATH, "utf8"));
  const mixedIdx = store.client_patterns.findIndex((p) => p.id === MIXED_ID);
  if (mixedIdx < 0) throw new Error("mixed shirt pattern not found");
  const mixed = store.client_patterns[mixedIdx];

  const cottonFiles = (mixed.files || []).filter((f) => isCottonName(f.filename));
  const linenFiles = (mixed.files || []).filter((f) => !isCottonName(f.filename));
  // Keep linen-named + loro on linen pattern; cotton-named move out.
  // Linen Shirt Final xlsx that lived in Cotton Shirt folder stay with linen pattern.
  const stay = (mixed.files || []).filter((f) => isLinenName(f.filename) || (!isCottonName(f.filename) && !isLinenName(f.filename)));
  // Actually: move only clear cotton files; linen sheets go to linen pattern even if they were in Cotton folder.
  const move = (mixed.files || []).filter((f) => isCottonName(f.filename));
  const keep = (mixed.files || []).filter((f) => !isCottonName(f.filename));

  console.log("Keep on linen pattern:", keep.map((f) => f.filename));
  console.log("Move to cotton pattern:", move.map((f) => f.filename));

  const ts = Date.now();
  const cottonMeasSource = move.find((f) => f.kind === "xlsx" && /cotton shirt final\s+\d/i.test(f.filename)) || move.find((f) => f.kind === "xlsx");
  let cottonMeasurements = (mixed.versions[0]?.measurements || []).map((m) => ({
    ...m,
    base_value: null,
    target_value: null,
    sewn_value: null,
    adjustment: null,
  }));
  if (cottonMeasSource) {
    const path = findSourceXlsx(cottonMeasSource.filename);
    if (path) {
      const parsed = parseXlsx(path);
      if (parsed?.ok) cottonMeasurements = pointsToMeasurements(parsed.points);
    }
  }

  const cottonVersion = {
    id: `cpv-${ts}-1`,
    version: 1,
    is_final: true,
    trial_date: "2026-07-25",
    measurements: cottonMeasurements,
    special_instructions: null,
    notes: "Split from mixed shirt pattern; Cotton Shirt Final import",
    files: [],
    created_by: "info@hagan.pro",
    updated_by: "info@hagan.pro",
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  const cottonActive = move.filter((f) => f.kind === "tud").slice(-1)[0] || null;
  const cotton = {
    id: `cp-${ts}-cotton-shirt`,
    pattern_ref: "SHIRT-COTTON-CUSTOM",
    client_id: mixed.client_id,
    client_code: mixed.client_code,
    client_name: mixed.client_name,
    garment_type: "shirt",
    description: "Cotton shirt - imported from zipfiletrialandfinal_ (split from Loro Piana shirt pattern)",
    base_pattern_id: null,
    base_size: cottonActive?.tud?.sizes?.[0] || null,
    house_brand_id: mixed.house_brand_id,
    house_brand_code: mixed.house_brand_code,
    fabric: "Cotton",
    linked_fabric_line_ids: [],
    unit: "cm",
    versions: [cottonVersion],
    final_version_id: cottonVersion.id,
    special_instructions: null,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    files: move,
    active_tud_file_id: cottonActive?.id || null,
    active_tud_by_piece: cottonActive ? { Shirt: cottonActive.id } : {},
    notes: "Created by repair-ajlan-shirt-split-and-fill.mjs after cotton files were attached to Loro Piana shirt.",
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  // Fix linen/loro pattern
  mixed.files = keep;
  mixed.fabric = "Linen";
  mixed.description = "Loro Piana / Linen shirt - imported from zipfiletrialandfinal_";
  mixed.notes = [mixed.notes, "Fabric corrected to Linen; cotton files moved to " + cotton.id]
    .filter(Boolean)
    .join(" | ");
  const loroFinal = keep.find((f) => f.kind === "tud" && /loro|lora|final/i.test(f.filename));
  if (loroFinal) {
    mixed.active_tud_file_id = loroFinal.id;
    mixed.active_tud_by_piece = { Shirt: loroFinal.id };
    if (loroFinal.tud?.sizes?.[0]) mixed.base_size = loroFinal.tud.sizes[0];
  }
  mixed.updated_at = nowIso();

  store.client_patterns[mixedIdx] = mixed;
  store.client_patterns.push(cotton);

  // Fill measurements for all this client's patterns
  const fills = [];
  for (const p of store.client_patterns.filter((x) => x.client_code === CLIENT_CODE)) {
    // For jacket with 2 versions, fill trial from trial sheet and final from final sheet
    if (p.garment_type === "jacket" && p.versions.length >= 2) {
      const trialFile = (p.files || []).concat(p.versions.flatMap((v) => v.files || [])).find((f) => f.kind === "xlsx" && /trial/i.test(f.filename));
      const finalFile = (p.files || []).find((f) => f.kind === "xlsx" && /final/i.test(f.filename) && !/\bN\d|42789/i.test(f.filename))
        || (p.files || []).find((f) => f.kind === "xlsx" && /final/i.test(f.filename));
      if (trialFile) {
        const path = findSourceXlsx(trialFile.filename);
        if (path) {
          const parsed = parseXlsx(path);
          if (parsed?.ok) {
            p.versions[0].measurements = pointsToMeasurements(parsed.points);
            p.versions[0].updated_at = nowIso();
            fills.push({ id: p.id, stage: "trial", n: parsed.filled_count, src: trialFile.filename });
          }
        }
      }
      if (finalFile) {
        const path = findSourceXlsx(finalFile.filename);
        if (path) {
          const parsed = parseXlsx(path);
          if (parsed?.ok) {
            const fv = p.versions.find((v) => v.id === p.final_version_id) || p.versions[1];
            fv.measurements = pointsToMeasurements(parsed.points);
            fv.special_instructions = parsed.special_instructions || fv.special_instructions;
            fv.updated_at = nowIso();
            if (parsed.pattern_ref) p.pattern_ref = parsed.pattern_ref.trim();
            if (parsed.unit) p.unit = parsed.unit;
            fills.push({ id: p.id, stage: "final", n: parsed.filled_count, src: finalFile.filename });
          }
        }
      }
      p.updated_at = nowIso();
      continue;
    }

    if (p.garment_type === "shirt" && p.fabric === "Knit" && p.versions.length >= 2) {
      const trialX = (p.files || []).find((f) => f.kind === "xlsx");
      if (trialX) {
        const path = findSourceXlsx(trialX.filename);
        if (path) {
          const parsed = parseXlsx(path);
          if (parsed?.ok) {
            for (const v of p.versions) {
              v.measurements = pointsToMeasurements(parsed.points);
              v.updated_at = nowIso();
            }
            if (parsed.pattern_ref) p.pattern_ref = parsed.pattern_ref.trim();
            if (parsed.unit) p.unit = parsed.unit;
            fills.push({ id: p.id, stage: "both", n: parsed.filled_count, src: trialX.filename });
          }
        }
      }
      p.updated_at = nowIso();
      continue;
    }

    const result = fillFromBestXlsx(p, "final");
    if (result.filled) fills.push({ id: p.id, stage: "final", n: result.filled, src: result.source });
  }

  store.updated_at = nowIso();
  const { error: upErr } = await admin.from("erp_documents").upsert(
    { id: "pattern_library", data: store, updated_at: store.updated_at },
    { onConflict: "id" }
  );
  if (upErr) throw upErr;
  writeFileSync(LIBRARY_PATH, JSON.stringify(store, null, 2) + "\n");

  console.log("\nCreated cotton pattern:", cotton.id);
  console.log("Fills:");
  for (const f of fills) console.log(" ", f);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
