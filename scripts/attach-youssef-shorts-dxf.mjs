#!/usr/bin/env node
/**
 * Attach Youssef shorts 18.06.26 .dxf (+ .rul) onto EXISTING pattern
 * cp-1785002669728-87 (SHORTS-LINEN-CUSTOM). Idempotent by filename.
 * Reseeds marker_layout from DXF outlines when current board is TUD-approx.
 * Keeps existing marker_fabric_width_cm / double_fold (148cm Solbiati).
 *
 * Usage:
 *   node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs scripts/attach-youssef-shorts-dxf.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { augmentDxfWithDerivedBelt } from "../src/lib/pattern-library/derived-belt.ts";
import { parseDxfFile } from "../src/lib/pattern-library/dxf-parser.ts";
import { parseRulFile } from "../src/lib/pattern-library/rul-parser.ts";
import { estimateNestFromDxf } from "../src/lib/pattern-library/nest-estimate.ts";
import { layoutFromNestEstimate } from "../src/lib/pattern-library/marker-layout.ts";

const PATTERN_ID = "cp-1785002669728-87";
const DXF_PATH =
  "/Users/ralphrahme/Downloads/Youssef Al Rashed Shorts  18.06.26.dxf";
const RUL_PATH =
  "/Users/ralphrahme/Downloads/Youssef Al Rashed Shorts  18.06.26.rul";
const UPLOADED_BY = "info@hagan.pro";
const BUCKET = "erp-pattern-files";
const LOCAL_LIBRARY = resolve("src/data/pattern-library.json");

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function nowIso() {
  return new Date().toISOString();
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
    if (!response.ok) console.warn(`  Zapier ${event}: HTTP ${response.status}`);
    else console.log(`  notified ${event}`);
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
  if (localPath) writeFileSync(localPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

async function uploadBytes(admin, storedFilename, buffer, contentType) {
  const objectPath = `pattern-library/${storedFilename}`;
  let { error } = await admin.storage
    .from(BUCKET)
    .upload(objectPath, buffer, { contentType, upsert: true });
  if (error && /mime/i.test(error.message)) {
    ({ error } = await admin.storage.from(BUCKET).upload(objectPath, buffer, {
      contentType: "application/octet-stream",
      upsert: true,
    }));
  }
  if (error) throw new Error(`storage upload failed: ${error.message}`);
}

function layoutIsDxf(layout) {
  return Boolean(
    layout?.placements?.some(
      (p) => p.geometry_source === "dxf" && (p.outline_cm?.length ?? 0) >= 3
    )
  );
}

loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env");

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const library = await fetchDoc(admin, "pattern_library");
const patternIndex = (library.client_patterns || []).findIndex((p) => p.id === PATTERN_ID);
if (patternIndex < 0) throw new Error(`Pattern ${PATTERN_ID} not found in live library`);
const pattern = library.client_patterns[patternIndex];
console.log(
  `Target ${pattern.id} (${pattern.pattern_ref}) ${pattern.garment_type} - ${pattern.client_name}`
);
console.log(
  "Existing:",
  (pattern.files || []).map((f) => `${f.kind}:${f.filename}`).join(", ")
);

async function attachFile(filePath, kind, enrich) {
  const filename = basename(filePath);
  const already = (pattern.files || []).find((f) => f.filename === filename);
  if (already) {
    // Refresh parsed metadata (e.g. after units fix) without re-uploading bytes.
    if (existsSync(filePath)) {
      const buffer = readFileSync(filePath);
      Object.assign(already, enrich(buffer));
      console.log(`REFRESH metadata: ${filename} (${already.id})`);
    } else {
      console.log(`SKIP already attached: ${filename} (${already.id})`);
    }
    return { attachment: already, created: false };
  }
  if (!existsSync(filePath)) throw new Error(`Missing: ${filePath}`);
  const buffer = readFileSync(filePath);
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedFilename = `${PATTERN_ID}-${Date.now()}-${sanitized}`;
  const contentType = kind === "dxf" ? "application/dxf" : "text/plain";
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
    ...enrich(buffer),
  };
  pattern.files = [...(pattern.files || []), attachment];
  console.log(`ATTACHED ${kind} ${attachment.id} ${filename}`);
  return { attachment, created: true };
}

const dxfResult = await attachFile(DXF_PATH, "dxf", (buffer) => {
  const parsed = parseDxfFile(buffer);
  if (!parsed) throw new Error("DXF parse returned null");
  console.log(
    `  parsed DXF: ${parsed.metadata.pieces.length} pieces, sizes=${parsed.metadata.sizes.join(",")}`
  );
  return { dxf: parsed.metadata };
});

const rulResult = existsSync(RUL_PATH)
  ? await attachFile(RUL_PATH, "rul", (buffer) => {
      const parsed = parseRulFile(buffer);
      if (!parsed) throw new Error("RUL parse returned null");
      console.log(`  parsed RUL: sizes=${parsed.sizes.join(",")}`);
      return { rul: parsed };
    })
  : { attachment: null, created: false };

const ts = nowIso();
pattern.updated_at = ts;

// Keep existing marker width / fold (shorts: 148cm Solbiati double fold).
const width =
  typeof pattern.marker_fabric_width_cm === "number" && pattern.marker_fabric_width_cm > 0
    ? pattern.marker_fabric_width_cm
    : typeof pattern.marker_layout?.fabric_width_cm === "number" &&
        pattern.marker_layout.fabric_width_cm > 0
      ? pattern.marker_layout.fabric_width_cm
      : 148;
const doubleFold =
  pattern.marker_double_fold === true || pattern.marker_double_fold === false
    ? pattern.marker_double_fold
    : pattern.marker_layout?.double_fold === true ||
        pattern.marker_layout?.double_fold === false
      ? pattern.marker_layout.double_fold
      : true;

const rawDxf = dxfResult.attachment.dxf;
const nestDxf = rawDxf ? augmentDxfWithDerivedBelt(rawDxf, pattern) : null;
if (nestDxf && nestDxf.pieces.length !== (rawDxf?.pieces?.length ?? 0)) {
  console.log(
    `  derived pieces for nest: ${nestDxf.pieces.map((p) => p.name).join(", ")}`
  );
}

const layoutHasBelt = Boolean(
  pattern.marker_layout?.placements?.some((p) =>
    /^(belt|waist\s*band|waistband)$/i.test(String(p.name || "").trim())
  )
);
const forceReseed =
  process.env.FORCE_RESEED === "1" ||
  !layoutIsDxf(pattern.marker_layout) ||
  // Prior bad parse (ENGLISH?mm default) left absurdly small placements.
  (pattern.marker_layout?.placements?.every((p) => (p.width_cm ?? 0) < 5) ?? false) ||
  // TUKAmark has belt; reseed when saved board is still front+back only.
  (Boolean(nestDxf?.pieces.some((p) => /^belt$/i.test(p.name))) && !layoutHasBelt);

if (forceReseed && nestDxf?.pieces?.length) {
  const nest = estimateNestFromDxf({
    dxf: nestDxf,
    fabric_width_cm: width,
    double_fold: doubleFold,
    size: pattern.base_size || "M",
    garment_qty: pattern.marker_layout?.garment_qty ?? 1,
  });
  if (nest) {
    pattern.marker_layout = layoutFromNestEstimate(nest, {
      source: "auto",
      updated_at: ts,
    });
    pattern.marker_fabric_width_cm = pattern.marker_fabric_width_cm ?? width;
    pattern.marker_double_fold =
      pattern.marker_double_fold === true || pattern.marker_double_fold === false
        ? pattern.marker_double_fold
        : doubleFold;
    console.log(
      `Reseeded marker_layout from DXF: ${pattern.marker_layout.placements.length} placements, ` +
        `${pattern.marker_layout.packed_length_m}m, eff ${pattern.marker_layout.efficiency_pct}% ` +
        `[${pattern.marker_layout.placements.map((p) => p.name).join(", ")}]`
    );
  }
} else {
  console.log("marker_layout already has DXF outlines - left unchanged");
}

// Re-fetch immediately before write so parallel Suit edits are less likely to be clobbered.
const fresh = await fetchDoc(admin, "pattern_library");
const freshIndex = (fresh.client_patterns || []).findIndex((p) => p.id === PATTERN_ID);
if (freshIndex < 0) throw new Error(`Pattern ${PATTERN_ID} missing on re-fetch`);
const freshPattern = fresh.client_patterns[freshIndex];
const mergedFiles = [...(freshPattern.files || [])];
for (const f of pattern.files || []) {
  if (!mergedFiles.some((x) => x.filename === f.filename || x.id === f.id)) {
    mergedFiles.push(f);
  } else {
    const i = mergedFiles.findIndex((x) => x.filename === f.filename || x.id === f.id);
    // Prefer our DXF/RUL attachment payloads (parsed metadata).
    if (f.kind === "dxf" || f.kind === "rul") mergedFiles[i] = f;
  }
}
fresh.client_patterns[freshIndex] = {
  ...freshPattern,
  files: mergedFiles,
  updated_at: ts,
  marker_layout: pattern.marker_layout,
  marker_fabric_width_cm: pattern.marker_fabric_width_cm ?? freshPattern.marker_fabric_width_cm,
  marker_double_fold:
    pattern.marker_double_fold === true || pattern.marker_double_fold === false
      ? pattern.marker_double_fold
      : freshPattern.marker_double_fold,
};
await syncDoc(admin, "pattern_library", fresh, LOCAL_LIBRARY);

const saved = fresh.client_patterns[freshIndex];

if (dxfResult.created) {
  await notify("pattern_library.file_uploaded", {
    client_pattern_id: PATTERN_ID,
    file_id: dxfResult.attachment.id,
    filename: dxfResult.attachment.filename,
    kind: "dxf",
    uploaded_by: UPLOADED_BY,
    dxf_piece_count: dxfResult.attachment.dxf?.pieces?.length,
    dxf_total_cut_pieces: dxfResult.attachment.dxf?.total_cut_pieces,
    dxf_sizes: dxfResult.attachment.dxf?.sizes,
    dxf_has_outlines: true,
  });
}
if (rulResult.created && rulResult.attachment) {
  await notify("pattern_library.file_uploaded", {
    client_pattern_id: PATTERN_ID,
    file_id: rulResult.attachment.id,
    filename: rulResult.attachment.filename,
    kind: "rul",
    uploaded_by: UPLOADED_BY,
    rul_sizes: rulResult.attachment.rul?.sizes,
  });
}
if (layoutIsDxf(saved.marker_layout)) {
  await notify("client_pattern.marker_layout_saved", {
    id: PATTERN_ID,
    pattern_ref: saved.pattern_ref,
    client_id: saved.client_id,
    size: saved.marker_layout.size,
    garment_qty: saved.marker_layout.garment_qty,
    fabric_width_cm: saved.marker_layout.fabric_width_cm,
    double_fold: saved.marker_layout.double_fold,
    packed_length_m: saved.marker_layout.packed_length_m,
    efficiency_pct: saved.marker_layout.efficiency_pct,
    placement_count: saved.marker_layout.placements.length,
    source: saved.marker_layout.source,
    updated_by: UPLOADED_BY,
    geometry_source: "dxf",
  });
}

const orderedMeters = 1; // SO-2026-0002 L33 Short S24036
const packed = saved.marker_layout?.packed_length_m;
const fits =
  typeof packed === "number" ? packed <= orderedMeters : null;

console.log("\nDone.");
console.log(`  pattern: ${PATTERN_ID} (${saved.pattern_ref})`);
console.log(`  dxf: ${dxfResult.attachment.id} - ${dxfResult.attachment.filename}`);
if (rulResult.attachment) {
  console.log(`  rul: ${rulResult.attachment.id} - ${rulResult.attachment.filename}`);
}
console.log(
  `  pieces: ${dxfResult.attachment.dxf?.pieces?.length} | cut: ${dxfResult.attachment.dxf?.total_cut_pieces} | placements: ${saved.marker_layout?.placements?.length}`
);
console.log(
  `  width: ${saved.marker_layout?.fabric_width_cm}cm fold=${saved.marker_layout?.double_fold} usable=${saved.marker_layout?.usable_width_cm}cm`
);
console.log(
  `  packed: ${saved.marker_layout?.packed_length_m}m | eff: ${saved.marker_layout?.efficiency_pct}% | area: ${saved.marker_layout?.area_m2}m2`
);
console.log(
  `  vs SO S24036 ordered ${orderedMeters}m: ${fits === null ? "n/a" : fits ? "FITS" : "OVER"}`
);
console.log(`  UI: /pattern/library/clients/${PATTERN_ID}`);
