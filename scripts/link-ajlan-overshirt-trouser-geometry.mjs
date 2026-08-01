#!/usr/bin/env node
/**
 * Link Ajlan Overshirt+Trouser shell (cp-1785530548299-1002) to sibling
 * Overshirt DXF/TUD (cp-1785517898187-126) + Trouser TUD (cp-1785517883817-124).
 * Same stored files  no re-upload. Retags overshirt sibling garment_type from
 * "shirt" ? "Overshirt" so multi-piece hydration can find it.
 *
 * Usage:
 *   node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs scripts/link-ajlan-overshirt-trouser-geometry.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildAutoMarkerLayout } from "../src/lib/pattern-library/marker-layout.ts";

const SHELL_ID = "cp-1785530548299-1002";
const OVERSHIRT_ID = "cp-1785517898187-126";
const TROUSER_ID = "cp-1785517883817-124";
const FABRIC_WIDTH_CM = 148;
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

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
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

function cloneForPiece(source, pieceName, kind) {
  return {
    ...JSON.parse(JSON.stringify(source)),
    id: newId(`plf-ost-${kind}`),
    piece_name: pieceName,
    uploaded_at: nowIso(),
    uploaded_by: "script:link-ajlan-overshirt-trouser-geometry",
  };
}

function alreadyLinked(files, kind, pieceName, storedFilename) {
  return files.some(
    (f) =>
      f.kind === kind &&
      (f.piece_name ?? "").trim() === pieceName &&
      f.stored_filename === storedFilename
  );
}

function normalizeGarment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase env");

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const library = await fetchDoc(admin, "pattern_library");
const shellIndex = (library.client_patterns || []).findIndex((p) => p.id === SHELL_ID);
const overshirtIndex = (library.client_patterns || []).findIndex((p) => p.id === OVERSHIRT_ID);
const trouser = (library.client_patterns || []).find((p) => p.id === TROUSER_ID);
if (shellIndex < 0) throw new Error(`Shell ${SHELL_ID} not found`);
if (overshirtIndex < 0) throw new Error(`Overshirt ${OVERSHIRT_ID} not found`);
if (!trouser) throw new Error(`Trouser ${TROUSER_ID} not found`);

let overshirt = library.client_patterns[overshirtIndex];
if (normalizeGarment(overshirt.garment_type) !== "overshirt") {
  const prev = overshirt.garment_type;
  overshirt = {
    ...overshirt,
    garment_type: "Overshirt",
    updated_at: nowIso(),
    notes: overshirt.notes?.includes("Retagged garment_type Overshirt")
      ? overshirt.notes
      : [overshirt.notes, `Retagged garment_type Overshirt (was ${prev}) for Overshirt+Trouser sibling match.`]
          .filter(Boolean)
          .join(" | "),
  };
  library.client_patterns[overshirtIndex] = overshirt;
  console.log(`~ Overshirt sibling garment_type: ${prev} ? Overshirt`);
} else {
  console.log("= Overshirt sibling already garment_type Overshirt");
}

const shell = library.client_patterns[shellIndex];
const overshirtTud = (overshirt.files || []).find((f) => f.kind === "tud" && f.tud);
const overshirtDxf = (overshirt.files || []).find((f) => f.kind === "dxf" && f.dxf?.pieces?.length);
const trouserTud = (trouser.files || []).find((f) => f.kind === "tud" && f.tud);
if (!overshirtTud) throw new Error("Overshirt has no TUD");
if (!overshirtDxf) throw new Error("Overshirt has no DXF");
if (!trouserTud) throw new Error("Trouser has no TUD");

const files = [...(shell.files || [])];
const active_tud_by_piece = { ...(shell.active_tud_by_piece || {}) };
let added = 0;

if (!alreadyLinked(files, "tud", "Overshirt", overshirtTud.stored_filename)) {
  const cloned = cloneForPiece(overshirtTud, "Overshirt", "tud");
  files.push(cloned);
  active_tud_by_piece.Overshirt = cloned.id;
  added += 1;
  console.log("+ Overshirt TUD", cloned.filename);
} else {
  const existing = files.find(
    (f) =>
      f.kind === "tud" &&
      f.piece_name === "Overshirt" &&
      f.stored_filename === overshirtTud.stored_filename
  );
  if (existing) active_tud_by_piece.Overshirt = existing.id;
  console.log("= Overshirt TUD already linked");
}

if (!alreadyLinked(files, "dxf", "Overshirt", overshirtDxf.stored_filename)) {
  files.push(cloneForPiece(overshirtDxf, "Overshirt", "dxf"));
  added += 1;
  console.log("+ Overshirt DXF", overshirtDxf.filename);
} else {
  console.log("= Overshirt DXF already linked");
}

if (!alreadyLinked(files, "tud", "Trouser", trouserTud.stored_filename)) {
  const cloned = cloneForPiece(trouserTud, "Trouser", "tud");
  files.push(cloned);
  active_tud_by_piece.Trouser = cloned.id;
  added += 1;
  console.log("+ Trouser TUD", cloned.filename);
} else {
  const existing = files.find(
    (f) =>
      f.kind === "tud" &&
      f.piece_name === "Trouser" &&
      f.stored_filename === trouserTud.stored_filename
  );
  if (existing) active_tud_by_piece.Trouser = existing.id;
  console.log("= Trouser TUD already linked");
}

const timestamp = nowIso();
let next = {
  ...shell,
  files,
  active_tud_by_piece,
  active_tud_file_id: active_tud_by_piece.Overshirt ?? shell.active_tud_file_id ?? null,
  marker_fabric_width_cm: FABRIC_WIDTH_CM,
  marker_double_fold:
    shell.marker_double_fold === true || shell.marker_double_fold === false
      ? shell.marker_double_fold
      : true,
  base_size: shell.base_size || overshirt.base_size || trouser.base_size || null,
  notes: shell.notes?.includes("Linked overshirt DXF")
    ? shell.notes
    : [
        shell.notes,
        "Linked overshirt DXF/TUD + trouser TUD from sibling patterns; fabric width 148 cm. Ordered length from SO lines (3 m).",
      ]
        .filter(Boolean)
        .join(" | "),
  updated_at: timestamp,
};

const layout = buildAutoMarkerLayout(next, {
  fabric_width_cm: FABRIC_WIDTH_CM,
  size: next.base_size,
  garment_qty: 1,
  requiredPieceNames: ["Overshirt", "Trouser"],
  updated_at: timestamp,
});
if (layout) {
  next = {
    ...next,
    marker_layout: layout,
    marker_fabric_width_cm: FABRIC_WIDTH_CM,
  };
  console.log(
    `marker_layout: packed ${layout.packed_length_m} m @ ${layout.fabric_width_cm} cm, ${layout.placements.length} placements, source=${layout.source}`
  );
  if (layout.packed_length_m > 3) {
    console.log(`OVER ordered 3.00 m by ${(layout.packed_length_m - 3).toFixed(3)} m (honest)`);
  } else {
    console.log(`fits on ordered 3.00 m`);
  }
} else {
  console.warn("Could not seed marker_layout");
}

library.client_patterns[shellIndex] = next;
await syncDoc(admin, "pattern_library", library, LOCAL_LIBRARY);
console.log(`\nShell ${SHELL_ID} updated (added ${added} file refs). Width=${FABRIC_WIDTH_CM} cm.`);
console.log(`  url: https://erp.hagan.pro/pattern/library/clients/${SHELL_ID}`);
console.log(`  SO L07 job: pj-1784910751927-6-0te4g ? same client_pattern_id`);
console.log(`  overshirt sibling: ${OVERSHIRT_ID}`);
console.log(`  trouser sibling: ${TROUSER_ID}`);
