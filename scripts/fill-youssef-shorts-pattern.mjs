#!/usr/bin/env node
/**
 * One-off: Youssef Al Rashed Shorts pattern + SO-2026-0002 L35 job (live Supabase).
 *
 * - Fill measurement sheet from NS10008 xlsx (job fabric S10008)
 * - Ensure .TUD bytes + active_tud_file_id
 * - Attach fabric-matched xlsx if missing
 * - Link pattern job client_pattern_id
 *
 * Usage:
 *   node --experimental-strip-types scripts/fill-youssef-shorts-pattern.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseTudFile } from "../src/lib/pattern-library/tud-parser.ts";

const PATTERN_ID = "cp-1785002669728-87";
const VERSION_ID = "cpv-1785002669728-1";
const JOB_ID = "pj-1783333310604-34-gqoou";
const UPLOADED_BY = "info@hagan.pro";
const BUCKET = "erp-pattern-files";

const TUD_PATH =
  "/Users/ralphrahme/Downloads/Mahrab pattern/Youssef Al Rashed/Linen Short Final/Youssef Al Rashed Shorts  18.06.26.tud";
const XLSX_PATH =
  "/Users/ralphrahme/Downloads/Mahrab pattern/Youssef Al Rashed/Linen Short Final/Youssef Al Rashed Linen Short NS10008  26.05.26.xlsx";

const NAME_MAP = {
  "1/2 waist": "1/2 Waist straight Relux",
  "waistband height": "Waist band height",
  "1/2 hip": "1/2 Hip (19cm below w/b)",
  "front rise": "Front rise (excluding w/b)",
  "back rise": "Back rise (excluding w/b)",
  "fly length": "Fly opening (excluding w/b)",
  "outseam length": "Outside (excluding w/b)",
  "inseam length": "Inseam",
  "1/2 thigh": "1/2 Thigh (1cm from crotch)",
  "1/2 bottom width": "1/2 Bottom leg opening",
  "pocket height": "Side pocket opening length",
  "back pocket width": "Back pocket opening width",
};

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

function normName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(name) {
  return (
    String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "point"
  );
}

function parseXlsx(xlsxPath) {
  const raw = execFileSync("python3", ["scripts/lib/parse-client-measurement-xlsx.py", xlsxPath], {
    encoding: "utf8",
  });
  const parsed = JSON.parse(raw);
  if (!parsed.ok) throw new Error(`xlsx parse failed: ${parsed.error ?? "unknown"}`);
  return parsed;
}

async function notify(event, data) {
  const url = process.env.ZAPIER_WEBHOOK_URL?.trim();
  if (!url) {
    console.log(`  (no ZAPIER_WEBHOOK_URL - skipped notify ${event})`);
    return;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        timestamp: nowIso(),
        source: "erp",
        data: { ...data, _source: "erp" },
      }),
    });
    if (!response.ok) {
      console.warn(`  Zapier ${event}: HTTP ${response.status}`);
    } else {
      console.log(`  notified ${event}`);
    }
  } catch (err) {
    console.warn(`  Zapier ${event} failed:`, err.message);
  }
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
  if (localPath) {
    writeFileSync(localPath, `${JSON.stringify(payload, null, 2)}\n`);
  }
  return payload;
}

async function downloadLibraryFile(admin, storedFilename) {
  const { data, error } = await admin.storage
    .from(BUCKET)
    .download(`pattern-library/${storedFilename}`);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function uploadBytes(admin, storedFilename, buffer, contentType) {
  const objectPath = `pattern-library/${storedFilename}`;
  let { error } = await admin.storage
    .from(BUCKET)
    .upload(objectPath, buffer, { contentType, upsert: true });
  if (error && /mime/i.test(error.message)) {
    ({ error } = await admin.storage
      .from(BUCKET)
      .upload(objectPath, buffer, { contentType: "application/octet-stream", upsert: true }));
  }
  if (error) throw new Error(`storage upload failed: ${error.message}`);
}

async function makeAttachment(admin, filePath, ownerPrefix) {
  const filename = basename(filePath);
  const buffer = readFileSync(filePath);
  if (!buffer.length) throw new Error("empty file");
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedFilename = `${ownerPrefix}-${Date.now()}-${sanitized}`;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const kind = ext === "tud" ? "tud" : ext === "xlsx" || ext === "xls" ? "xlsx" : "other";
  const contentType =
    kind === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/octet-stream";
  await uploadBytes(admin, storedFilename, buffer, contentType);

  const attachment = {
    id: `plf-${Date.now()}-${createHash("sha1").update(storedFilename).digest("hex").slice(0, 6)}`,
    kind,
    filename,
    stored_filename: storedFilename,
    content_type: contentType,
    size_bytes: buffer.length,
    uploaded_at: nowIso(),
    uploaded_by: UPLOADED_BY,
  };

  if (kind === "tud") {
    try {
      const parsed = parseTudFile(buffer);
      if (parsed) {
        attachment.tud = parsed.metadata;
        if (parsed.thumbnail) {
          const thumb = `${storedFilename}.thumb.jpg`;
          await uploadBytes(admin, thumb, parsed.thumbnail, "image/jpeg");
          attachment.thumbnail_stored_filename = thumb;
        }
      }
    } catch (err) {
      console.warn(`  tud parse warning: ${err.message}`);
    }
  }
  return attachment;
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const sheet = parseXlsx(XLSX_PATH);
console.log(
  `Parsed ${basename(XLSX_PATH)}: ${sheet.points.length} points, fabric=${sheet.fabric_code}, unit=${sheet.unit}`
);

const library = await fetchDoc(admin, "pattern_library");
const patternIndex = (library.client_patterns || []).findIndex((p) => p.id === PATTERN_ID);
if (patternIndex < 0) throw new Error(`Pattern ${PATTERN_ID} not in live pattern_library`);
const pattern = library.client_patterns[patternIndex];
const versionIndex = pattern.versions.findIndex((v) => v.id === VERSION_ID);
if (versionIndex < 0) throw new Error(`Version ${VERSION_ID} not found`);
const version = pattern.versions[versionIndex];

const bySource = new Map(sheet.points.map((p) => [normName(p.name), p]));
const usedSources = new Set();
const merged = version.measurements.map((row) => {
  const templateKey = normName(row.name);
  let source = bySource.get(templateKey) ?? null;
  if (!source) {
    for (const [srcKey, destName] of Object.entries(NAME_MAP)) {
      if (normName(destName) === templateKey) {
        source = bySource.get(srcKey) ?? null;
        if (source) break;
      }
    }
  }
  if (!source) return row;
  usedSources.add(normName(source.name));
  return {
    ...row,
    base_value: source.base_value,
    target_value: source.target_value ?? source.base_value,
    remarks: source.remarks ?? row.remarks,
  };
});

for (const point of sheet.points) {
  if (usedSources.has(normName(point.name))) continue;
  const mapped = NAME_MAP[normName(point.name)];
  if (mapped && merged.some((row) => normName(row.name) === normName(mapped))) continue;
  merged.push({
    point_id: slugify(point.name),
    name: point.name,
    remark: null,
    is_graded: true,
    base_value: point.base_value,
    target_value: point.target_value ?? point.base_value,
    sewn_value: null,
    adjustment: null,
    remarks: point.remarks,
  });
}

const filledCount = merged.filter((r) => r.base_value != null || r.target_value != null).length;
console.log(`Filling ${filledCount} / ${merged.length} measurement rows`);

const ts = nowIso();
pattern.versions[versionIndex] = {
  ...version,
  measurements: merged,
  special_instructions: sheet.special_instructions ?? version.special_instructions,
  notes:
    `Filled from ${basename(XLSX_PATH)} (fabric ${sheet.fabric_code ?? "NS10008"}) ` +
    `for SO-2026-0002 L35 / S10008. Source: Mahrab Linen Short Final.`,
  trial_date: version.trial_date || "2026-05-26",
  updated_by: UPLOADED_BY,
  updated_at: ts,
};
pattern.updated_at = ts;

// Ensure TUD in storage
let tud = (pattern.files || []).find((f) => f.kind === "tud") ?? null;
if (tud?.stored_filename) {
  const bytes = await downloadLibraryFile(admin, tud.stored_filename);
  if (bytes?.length) {
    console.log(`TUD present in storage (${bytes.length} bytes): ${tud.filename}`);
  } else {
    console.log("TUD metadata present but bytes missing - re-uploading...");
    pattern.files = (pattern.files || []).filter((f) => f.id !== tud.id);
    if (pattern.active_tud_file_id === tud.id) pattern.active_tud_file_id = null;
    tud = null;
  }
}

if (!tud) {
  if (!existsSync(TUD_PATH)) throw new Error(`TUD missing: ${TUD_PATH}`);
  tud = await makeAttachment(admin, TUD_PATH, PATTERN_ID);
  pattern.files = [...(pattern.files || []), tud];
  console.log(`Uploaded TUD ${tud.id}`);
  await notify("pattern_library.file_uploaded", {
    client_pattern_id: PATTERN_ID,
    file_id: tud.id,
    filename: tud.filename,
    kind: "tud",
    uploaded_by: UPLOADED_BY,
  });
  await notify("client_pattern.tud_version_uploaded", {
    id: PATTERN_ID,
    pattern_ref: pattern.pattern_ref,
    client_id: pattern.client_id,
    file_id: tud.id,
    filename: tud.filename,
    uploaded_by: UPLOADED_BY,
    is_active: true,
  });
}

if (pattern.active_tud_file_id !== tud.id) {
  pattern.active_tud_file_id = tud.id;
  console.log(`Set active_tud_file_id=${tud.id}`);
} else {
  console.log(`active_tud_file_id already ${tud.id}`);
}

const xlsxName = basename(XLSX_PATH);
const hasXlsx = (pattern.files || []).some((f) => f.kind === "xlsx" && f.filename === xlsxName);
if (!hasXlsx) {
  const xAtt = await makeAttachment(admin, XLSX_PATH, PATTERN_ID);
  pattern.files = [...(pattern.files || []), xAtt];
  console.log(`Attached xlsx ${xAtt.id} (${xlsxName})`);
  await notify("pattern_library.file_uploaded", {
    client_pattern_id: PATTERN_ID,
    file_id: xAtt.id,
    filename: xAtt.filename,
    kind: "xlsx",
    uploaded_by: UPLOADED_BY,
  });
} else {
  console.log(`xlsx already attached: ${xlsxName}`);
}

library.client_patterns[patternIndex] = pattern;
await syncDoc(admin, "pattern_library", library, resolve("src/data/pattern-library.json"));
await notify("client_pattern.updated", {
  id: PATTERN_ID,
  pattern_ref: pattern.pattern_ref,
  version_id: VERSION_ID,
  updated_by: UPLOADED_BY,
  filled_measurements: filledCount,
});
console.log("pattern_library saved to Supabase (+ local mirror)");

// Link job
const jobsDoc = await fetchDoc(admin, "pattern_jobs");
const jobIndex = (jobsDoc.jobs || []).findIndex((j) => j.id === JOB_ID);
if (jobIndex < 0) throw new Error(`Job ${JOB_ID} not in live pattern_jobs`);
const job = jobsDoc.jobs[jobIndex];
console.log(
  `Job before: client_pattern_id=${job.client_pattern_id ?? "null"} fabric=${job.fabric_number}`
);
jobsDoc.jobs[jobIndex] = {
  ...job,
  client_pattern_id: PATTERN_ID,
  client_pattern_version_id: VERSION_ID,
  updated_at: nowIso(),
};
await syncDoc(admin, "pattern_jobs", jobsDoc, resolve("src/data/pattern-jobs.json"));
await notify("pattern_job.updated", {
  id: JOB_ID,
  sales_order_id: job.sales_order_id,
  so_number: job.so_number,
  status: job.status,
  client_pattern_id: PATTERN_ID,
  updated_by: UPLOADED_BY,
});
console.log("pattern_jobs saved - job linked");

// Verify fresh
const lib2 = await fetchDoc(admin, "pattern_library");
const p2 = lib2.client_patterns.find((p) => p.id === PATTERN_ID);
const v2 = p2.versions.find((v) => v.id === VERSION_ID);
const filled = v2.measurements.filter((r) => r.base_value != null || r.target_value != null);
const jobs2 = await fetchDoc(admin, "pattern_jobs");
const j2 = jobs2.jobs.find((j) => j.id === JOB_ID);
const tudBytes = p2.files.find((f) => f.kind === "tud");
const tudOk = tudBytes
  ? Boolean((await downloadLibraryFile(admin, tudBytes.stored_filename))?.length)
  : false;

console.log("\n=== VERIFY ===");
console.log(
  JSON.stringify(
    {
      pattern_id: p2.id,
      pattern_ref: p2.pattern_ref,
      garment_type: p2.garment_type,
      unit: p2.unit,
      active_tud_file_id: p2.active_tud_file_id,
      tud_ok: tudOk,
      tud_files: p2.files.filter((f) => f.kind === "tud").map((f) => f.filename),
      xlsx_files: p2.files.filter((f) => f.kind === "xlsx").map((f) => f.filename),
      measurement_rows: v2.measurements.length,
      filled_rows: filled.length,
      filled_names: filled.map((r) => `${r.name}=${r.base_value}`),
      job: {
        id: j2.id,
        so_number: j2.so_number,
        article_number: j2.article_number,
        fabric_number: j2.fabric_number,
        client_pattern_id: j2.client_pattern_id,
        client_pattern_version_id: j2.client_pattern_version_id,
      },
      live_urls: {
        job: `https://erp.hagan.pro/pattern/jobs/${JOB_ID}`,
        sheet: `https://erp.hagan.pro/pattern/library/clients/${PATTERN_ID}`,
        print: `https://erp.hagan.pro/pattern/client-patterns/${PATTERN_ID}/print?job=${JOB_ID}`,
      },
    },
    null,
    2
  )
);
