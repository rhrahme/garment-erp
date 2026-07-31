/**
 * Import client Trial/Final pattern packs from
 *   ~/Downloads/zipfiletrialandfinal_/<Client Name>/
 * into live pattern_library + erp-pattern-files (Supabase).
 *
 * Re-runnable for any sibling client folder. Idempotent by filename.
 *
 * Usage:
 *   export PATH="/tmp/node-portable/node-v22.14.0-darwin-x64/bin:$PATH"
 *   node --experimental-strip-types scripts/import-zipfile-trial-final.mjs
 *   node --experimental-strip-types scripts/import-zipfile-trial-final.mjs --folder "Abdel Aziz Mohamad Al Ajlan"
 *   node --experimental-strip-types scripts/import-zipfile-trial-final.mjs --dry-run
 *   node --experimental-strip-types scripts/import-zipfile-trial-final.mjs --force-meas
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseTudFile } from "../src/lib/pattern-library/tud-parser.ts";

const ROOT = "/Users/ralphrahme/Downloads/zipfiletrialandfinal_";
const LIBRARY_PATH = resolve("src/data/pattern-library.json");
const CLIENTS_PATH = resolve("src/data/clients.json");
const BUCKET = "erp-pattern-files";
const UPLOADED_BY = "info@hagan.pro";
const XLSX_PARSER = resolve("scripts/lib/parse-client-measurement-xlsx.py");

/** Folder name ? ERP client code (override fuzzy match). */
const FORCE_MATCH = {
  "Abdel Aziz Mohamad Al Ajlan": "FR-0726-0039",
  "Ajlan Mohammad Al Ajlan": "FR-0626-0035",
  "Ibrahim Al Shwemi": "FR-0726-0037",
  "Abdelillah Abou Nayan": "FR-0326-0004",
};

/**
 * Explicit garment+fabric groups when folder names encode fabric variants.
 * garment_type uses Pattern Library keys (overshirt, shorts, ...).
 */
const FOLDER_GROUP_HINTS = [
  { match: /^shirt\s*lora\s*piana|^shirt\s*loro\s*piana/i, garment: "shirt", fabric: "Linen", label: "Loro Piana shirt" },
  { match: /^cotton\s*shirt/i, garment: "shirt", fabric: "Cotton", label: "Cotton shirt" },
  { match: /^knit\s*shirt/i, garment: "shirt", fabric: "Knit", label: "Knit shirt" },
  { match: /^linen\s*shirt/i, garment: "shirt", fabric: "Linen", label: "Linen shirt" },
  { match: /^cotton\s*trouser/i, garment: "trouser", fabric: "Cotton", label: "Cotton trouser" },
  { match: /^linen\s*trouser/i, garment: "trouser", fabric: "Linen", label: "Linen trouser" },
  { match: /^over\s*shirt|^overshirt/i, garment: "overshirt", fabric: null, label: "Overshirt" },
  { match: /^jacket/i, garment: "jacket", fabric: null, label: "Jacket" },
  { match: /^short(?!s?\s*sleeve)/i, garment: "shorts", fabric: null, label: "Shorts" },
  { match: /^trouser|^pant/i, garment: "trouser", fabric: null, label: "Trouser" },
  { match: /^shirt/i, garment: "shirt", fabric: null, label: "Shirt" },
];

const GARMENT_HINTS = [
  ["over shirt", "overshirt"],
  ["overshirt", "overshirt"],
  ["short sleeve", "shirt"],
  ["knit shirt", "shirt"],
  ["loro piana", "shirt"],
  ["lora piana", "shirt"],
  ["linen shirt", "shirt"],
  ["cotton shirt", "shirt"],
  ["linen trouser", "trouser"],
  ["cotton trouser", "trouser"],
  ["short pant", "shorts"],
  ["shorts", "shorts"],
  ["shirt", "shirt"],
  ["jacket", "jacket"],
  ["blazer", "jacket"],
  ["trouser", "trouser"],
  ["pant", "trouser"],
  ["short", "shorts"],
];

function loadEnv() {
  const envPath = resolve(".env.local");
  if (!existsSync(envPath)) throw new Error(".env.local not found");
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

function nowIso() {
  return new Date().toISOString();
}

function clientFullName(c) {
  return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ").trim();
}

function slug(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeName(s) {
  return slug(s)
    .replace(/mohammad/g, "mohamad")
    .replace(/abdelaziz/g, "abdel aziz")
    .replace(/abdul aziz/g, "abdel aziz")
    .replace(/abdulaziz/g, "abdel aziz")
    .replace(/abdeliah/g, "abdelillah")
    .replace(/\s+/g, " ")
    .trim();
}

function pathKind(relPath) {
  const parts = String(relPath)
    .split(/[/\\]/)
    .map((p) => p.toLowerCase());
  const name = basename(relPath).toLowerCase();
  if (parts.some((p) => p.includes("final")) || /\bfinal\b/.test(name)) return "final";
  if (parts.some((p) => p.includes("trial")) || /\btrial\b/.test(name)) return "trial";
  return "other";
}

function detectFabric(...texts) {
  const t = texts.join(" ").toLowerCase();
  if (/\bknit\b/.test(t)) return "Knit";
  if (/loro\s*piana|lora\s*piana/.test(t)) return "Linen";
  if (/\blinen\b/.test(t)) return "Linen";
  if (/\bcotton\b/.test(t)) return "Cotton";
  if (/\bwool\b/.test(t)) return "Wool";
  return null;
}

function detectGarment(...texts) {
  const t = texts.join(" ").toLowerCase();
  for (const [hint, g] of GARMENT_HINTS) {
    if (t.includes(hint)) return g;
  }
  return "custom";
}

function walkFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".") || ent.name.startsWith("~$")) continue;
      const full = join(cur, ent.name);
      if (ent.isDirectory()) {
        if (["copy", "marker", "new folder", "3d clo"].includes(ent.name.toLowerCase())) continue;
        stack.push(full);
      } else {
        out.push(full);
      }
    }
  }
  return out;
}

function parseDateFromName(name) {
  const m = String(name).match(/(\d{1,2})[.](\d{1,2})[.](\d{2,4})/);
  if (!m) return null;
  let [, dd, mm, yy] = m;
  const year = yy.length === 2 ? `20${yy}` : yy;
  return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function contentTypeFor(filename) {
  const ext = extname(filename).toLowerCase();
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".tud") return "application/octet-stream";
  return "application/octet-stream";
}

function kindFor(filename) {
  const ext = extname(filename).toLowerCase().slice(1);
  if (ext === "tud") return "tud";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  return "other";
}

function buildMeasurements(dictionary, garmentType, parsedPoints) {
  if (parsedPoints?.length) {
    return parsedPoints.map((point) => ({
      point_id: point.point_id,
      name: point.name,
      remark: null,
      is_graded: true,
      base_value: point.base_value ?? null,
      target_value: point.target_value ?? point.base_value ?? null,
      // Trial/Final columns on these sheets are usually empty; Size maps to base+target.
      sewn_value: point.final_value ?? point.trial_values?.["1"] ?? null,
      adjustment: null,
      remarks: point.remarks ?? null,
    }));
  }

  const keys = new Set(
    [garmentType, garmentType === "overshirt" ? "shirt" : null].filter(Boolean).map((t) => String(t).toLowerCase())
  );
  const template = (dictionary || []).filter((p) =>
    (p.garment_types || []).some((t) => keys.has(String(t).toLowerCase()))
  );
  return template.map((point) => ({
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

function patternRef(garment, fabric, size, fromSheet) {
  if (fromSheet && fromSheet.trim() && !/^new$/i.test(fromSheet.trim())) {
    return fromSheet.trim().replace(/\s+/g, " ");
  }
  const bits = [garment.toUpperCase()];
  if (fabric) bits.push(String(fabric).toUpperCase());
  bits.push("CUSTOM");
  if (size) bits.push(String(size).toUpperCase());
  return bits.join("-");
}

function fuzzyMatch(folderName, clients) {
  if (FORCE_MATCH[folderName]) {
    const code = FORCE_MATCH[folderName];
    const hit = clients.find((c) => c.code === code);
    if (hit) return { client: hit, score: 1, forced: true };
  }
  const fs = normalizeName(folderName);
  const ftoks = new Set(fs.split(" ").filter(Boolean));
  const drop = new Set(["mr", "sheikh", "prince", "pr", "abu", "moe", "bin"]);
  let best = null;
  let bestScore = 0;
  for (const c of clients) {
    if (String(c.code || "").startsWith("RM-")) continue;
    const cs = normalizeName(clientFullName(c));
    const ctoks = new Set(cs.split(" ").filter((t) => !drop.has(t)));
    const f2 = new Set([...ftoks].filter((t) => !drop.has(t)));
    const inter = [...f2].filter((t) => ctoks.has(t)).length;
    const union = new Set([...f2, ...ctoks]).size || 1;
    const jacc = inter / union;
    let same = 0;
    const shorter = fs.length < cs.length ? fs : cs;
    const longer = fs.length < cs.length ? cs : fs;
    if (longer.includes(shorter) && shorter.length > 6) same = 0.85;
    const score = Math.max(jacc + (same ? 0.2 : 0), same);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best || bestScore < 0.72) return null;
  return { client: best, score: bestScore, forced: false };
}

function resolveGroupFromFolder(folderName) {
  const name = folderName.trim();
  for (const hint of FOLDER_GROUP_HINTS) {
    if (hint.match.test(name)) {
      return {
        garment: hint.garment,
        fabric: hint.fabric,
        label: hint.label,
        key: `${hint.garment}:${(hint.fabric || "default").toLowerCase()}`,
      };
    }
  }
  const garment = detectGarment(name);
  const fabric = detectFabric(name);
  return {
    garment,
    fabric,
    label: name,
    key: `${garment}:${(fabric || "default").toLowerCase()}`,
  };
}

function resolveGroupFromRootFile(filename) {
  const garment = detectGarment(filename);
  const fabric = detectFabric(filename);
  let label = filename;
  if (garment === "overshirt") label = "Overshirt";
  else if (garment === "shorts") label = "Shorts";
  else if (garment === "trouser" && fabric) label = `${fabric} trouser`;
  else if (garment === "shirt" && fabric) label = `${fabric} shirt`;
  return {
    garment,
    fabric,
    label,
    key: `${garment}:${(fabric || "default").toLowerCase()}`,
  };
}

/**
 * Build pattern groups for one client folder.
 * Subdirs (Jacket, Cotton Trouser, ...) are primary groups; root-level
 * .tud/.xlsx merge into matching groups or create new ones.
 */
function retargetGroupForFile(baseGroup, filename) {
  const fab = detectFabric(filename);
  if (!fab) return baseGroup;
  // Keep overshirt / shorts / jacket folder identity even if sheet ref mentions linen.
  if (["overshirt", "shorts", "jacket"].includes(baseGroup.garment)) return baseGroup;
  if (!baseGroup.fabric) {
    return {
      garment: baseGroup.garment,
      fabric: fab,
      label: `${fab} ${baseGroup.garment}`,
      key: `${baseGroup.garment}:${fab.toLowerCase()}`,
    };
  }
  if (baseGroup.fabric.toLowerCase() === fab.toLowerCase()) return baseGroup;
  // Filename fabric disagrees with folder (e.g. Linen sheet inside Cotton Shirt/).
  return {
    garment: baseGroup.garment,
    fabric: fab,
    label: `${fab} ${baseGroup.garment}`,
    key: `${baseGroup.garment}:${fab.toLowerCase()}`,
  };
}

function buildClientGroups(clientDir) {
  /** @type {Map<string, any>} */
  const groups = new Map();

  function ensure(group) {
    if (!groups.has(group.key)) {
      groups.set(group.key, {
        ...group,
        tuds: { trial: [], final: [], other: [] },
        xlsx: { trial: [], final: [], other: [] },
      });
    }
    return groups.get(group.key);
  }

  function addFile(baseGroup, full) {
    const ext = extname(full).toLowerCase();
    if (ext !== ".tud" && ext !== ".xlsx") return;
    const group = ensure(retargetGroupForFile(baseGroup, basename(full)));
    const kind = pathKind(relative(clientDir, full));
    const bucket = ext === ".tud" ? group.tuds : group.xlsx;
    bucket[kind].push(full);
  }

  const entries = readdirSync(clientDir, { withFileTypes: true }).filter(
    (e) => !e.name.startsWith(".") && e.name !== ".DS_Store"
  );

  for (const ent of entries) {
    const full = join(clientDir, ent.name);
    if (ent.isDirectory()) {
      const group = resolveGroupFromFolder(ent.name);
      for (const file of walkFiles(full)) addFile(group, file);
    } else {
      const ext = extname(ent.name).toLowerCase();
      if (ext !== ".tud" && ext !== ".xlsx") continue;
      addFile(resolveGroupFromRootFile(ent.name), full);
    }
  }

  // Deduplicate paths within buckets
  for (const g of groups.values()) {
    for (const bucket of [g.tuds, g.xlsx]) {
      for (const k of ["trial", "final", "other"]) {
        bucket[k] = [...new Set(bucket[k])].sort((a, b) => {
          const da = parseDateFromName(basename(a)) || "";
          const db = parseDateFromName(basename(b)) || "";
          if (da !== db) return da.localeCompare(db);
          return statSync(a).mtimeMs - statSync(b).mtimeMs;
        });
      }
    }
  }

  return [...groups.values()].filter(
    (g) => g.tuds.trial.length + g.tuds.final.length + g.tuds.other.length + g.xlsx.trial.length + g.xlsx.final.length + g.xlsx.other.length > 0
  );
}

function pickPrimaryXlsx(group, stage) {
  const pool = [
    ...(stage === "final" ? group.xlsx.final : []),
    ...(stage === "trial" ? group.xlsx.trial : []),
    ...group.xlsx.other,
    ...group.xlsx.final,
    ...group.xlsx.trial,
  ];
  if (!pool.length) return null;
  // Prefer sheets without a fabric-code suffix in the name (generic pattern sheet).
  const scored = pool.map((p) => {
    const name = basename(p);
    const hasCode = /\b(N\d{5,}|NS\d+|S\d{4,}|\d{5,}-\d+)\b/i.test(name);
    const date = parseDateFromName(name) || "";
    return { p, hasCode: hasCode ? 1 : 0, date };
  });
  scored.sort((a, b) => a.hasCode - b.hasCode || b.date.localeCompare(a.date));
  return scored[0].p;
}

function parseXlsx(path) {
  const res = spawnSync("python3", [XLSX_PARSER, path], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error(`xlsx parse failed for ${path}: ${res.stderr || res.stdout}`);
  }
  const data = JSON.parse(res.stdout);
  return Array.isArray(data) ? data[0] : data;
}

function fabricKeysEqual(a, b) {
  const na = (a || "default").toLowerCase();
  const nb = (b || "default").toLowerCase();
  if (na === nb) return true;
  // Linen ? Loro Piana treated as same shirt family when one side empty handled elsewhere
  return false;
}

function patternFabricBlob(p) {
  return `${p.fabric || ""} ${p.description || ""} ${p.pattern_ref || ""} ${p.notes || ""} ${(p.files || [])
    .map((f) => f.filename)
    .join(" ")} ${(p.versions || []).flatMap((v) => (v.files || []).map((f) => f.filename)).join(" ")}`.toLowerCase();
}

function inferredFabric(p) {
  if (p.fabric) return String(p.fabric).toLowerCase();
  // Filenames/description only - ignore pattern_ref (sheets often reuse SS-SHIRT-LINEN-...).
  const blob = `${p.description || ""} ${p.notes || ""} ${(p.files || [])
    .map((f) => f.filename)
    .join(" ")} ${(p.versions || [])
    .flatMap((v) => (v.files || []).map((f) => f.filename))
    .join(" ")}`.toLowerCase();
  if (/knit/.test(blob)) return "knit";
  if (/loro|lora/.test(blob)) return "linen";
  if (/\blinen\b/.test(blob) && !/\bover\s*shirt|\bovershirt\b/.test(blob)) return "linen";
  if (/\bcotton\b/.test(blob)) return "cotton";
  if (/\bwool\b/.test(blob)) return "wool";
  return null;
}

function findExistingPattern(store, client, group) {
  const candidates = (store.client_patterns || []).filter(
    (p) => p.client_id === client.id && p.garment_type === group.garment
  );
  if (!candidates.length) return null;

  const want = (group.fabric || "").toLowerCase() || null;

  // Exact fabric field match
  const exact = candidates.find((p) => fabricKeysEqual(p.fabric, group.fabric) && (p.fabric || group.fabric));
  if (exact) return exact;

  if (want) {
    const byInfer = candidates.find((p) => inferredFabric(p) === want);
    if (byInfer) return byInfer;
    // Do NOT fall through to a differently-fabricked shirt/trouser.
    return null;
  }

  // No fabric on the import group: reuse unique garment pattern, or unique null-fabric one.
  if (candidates.length === 1) return candidates[0];
  const noFabricField = candidates.filter((p) => !p.fabric);
  if (noFabricField.length === 1) return noFabricField[0];
  const neutrals = candidates.filter((p) => !inferredFabric(p));
  if (neutrals.length === 1) return neutrals[0];
  return null;
}

function allAttachments(pattern) {
  return [...(pattern.files || []), ...(pattern.versions || []).flatMap((v) => v.files || [])];
}

function hasFilename(pattern, filename) {
  return allAttachments(pattern).some((f) => f.filename === filename);
}

function pieceNameFromPath(filePath, garment) {
  const name = basename(filePath).toLowerCase();
  // Suit-style multi-piece only when filename explicitly names a piece slot.
  if (/\bjacket\b/.test(name) && garment !== "jacket") return "Jacket";
  if (/\btrouser\b|\bpant\b/.test(name) && garment !== "trouser") return "Trouser";
  if (garment === "jacket") return "Jacket";
  if (garment === "trouser") return "Trouser";
  if (garment === "shorts") return "Shorts";
  if (garment === "overshirt") return "Overshirt";
  if (garment === "shirt") return "Shirt";
  return null;
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

async function makeAttachment(admin, filePath, ownerPrefix, pieceName) {
  const filename = basename(filePath);
  const buffer = readFileSync(filePath);
  if (!buffer.length) throw new Error(`empty file: ${filename}`);
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedFilename = `${ownerPrefix}-${Date.now()}-${sanitized}`;
  const contentType = contentTypeFor(filename);
  await uploadBytes(admin, storedFilename, buffer, contentType);

  const attachment = {
    id: `plf-${Date.now()}-${createHash("sha1").update(storedFilename).digest("hex").slice(0, 6)}`,
    kind: kindFor(filename),
    filename,
    stored_filename: storedFilename,
    content_type: contentType,
    size_bytes: buffer.length,
    uploaded_at: nowIso(),
    uploaded_by: UPLOADED_BY,
    piece_name: pieceName || null,
  };

  if (attachment.kind === "tud") {
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
      console.warn(`  tud parse warning for ${filename}: ${err.message}`);
    }
  }
  return attachment;
}

function measurementsNeedFill(version) {
  const rows = version?.measurements || [];
  if (!rows.length) return true;
  return !rows.some((r) => r.base_value != null || r.target_value != null || r.sewn_value != null);
}

function applyMeasurements(version, parsed, force, dictionary, garmentType) {
  if (!parsed?.ok || !parsed.points?.length) return { version, filled: 0 };
  if (!force && !measurementsNeedFill(version)) return { version, filled: 0 };
  const measurements = buildMeasurements(dictionary, garmentType, parsed.points);
  return {
    version: {
      ...version,
      measurements,
      special_instructions: parsed.special_instructions || version.special_instructions,
      updated_at: nowIso(),
    },
    filled: parsed.filled_count || parsed.points.length,
  };
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const forceMeas = args.includes("--force-meas");
  const folderIdx = args.indexOf("--folder");
  const folderFilter =
    folderIdx >= 0
      ? new Set(
          args
            .slice(folderIdx + 1)
            .filter((a) => !a.startsWith("--"))
            .flatMap((s) => s.split("|").map((x) => x.trim()).filter(Boolean))
        )
      : null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const clientsDoc = JSON.parse(readFileSync(CLIENTS_PATH, "utf8"));
  const clients = clientsDoc.clients || [];

  const { data: remoteRow, error: remoteErr } = await admin
    .from("erp_documents")
    .select("data, updated_at")
    .eq("id", "pattern_library")
    .maybeSingle();
  if (remoteErr) throw remoteErr;

  const local = existsSync(LIBRARY_PATH)
    ? JSON.parse(readFileSync(LIBRARY_PATH, "utf8"))
    : { dictionary: [], base_patterns: [], client_patterns: [] };

  const cpsById = new Map();
  for (const cp of remoteRow?.data?.client_patterns || []) cpsById.set(cp.id, cp);
  for (const cp of local.client_patterns || []) {
    if (!cpsById.has(cp.id)) cpsById.set(cp.id, cp);
  }

  let store = {
    updated_at: nowIso(),
    dictionary: remoteRow?.data?.dictionary || local.dictionary || [],
    base_patterns: remoteRow?.data?.base_patterns || local.base_patterns || [],
    client_patterns: [...cpsById.values()],
  };

  // Prefer remote client_patterns as source of truth for merge base.
  if (remoteRow?.data?.client_patterns?.length) {
    store.client_patterns = remoteRow.data.client_patterns.map((cp) => {
      const localHit = (local.client_patterns || []).find((c) => c.id === cp.id);
      return localHit && (localHit.updated_at || "") > (cp.updated_at || "") ? localHit : cp;
    });
    // Keep any local-only patterns
    for (const cp of local.client_patterns || []) {
      if (!store.client_patterns.some((c) => c.id === cp.id)) store.client_patterns.push(cp);
    }
  }

  const top = readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const folders = top.filter((name) => !folderFilter || folderFilter.has(name));
  console.log(`Root: ${ROOT}`);
  console.log(`Folders: ${folders.join(" | ") || "(none)"}`);

  const plan = [];
  for (const folder of folders) {
    const match = fuzzyMatch(folder, clients);
    if (!match) {
      console.warn(`UNMATCHED folder: ${folder}`);
      continue;
    }
    const groups = buildClientGroups(join(ROOT, folder));
    for (const group of groups) {
      plan.push({ folder, client: match.client, score: match.score, group });
    }
  }

  console.log(`Plan: ${plan.length} garment groups`);
  for (const row of plan) {
    const g = row.group;
    const tudSummary = `tud[t=${g.tuds.trial.length},f=${g.tuds.final.length},o=${g.tuds.other.length}]`;
    const xSummary = `xlsx[t=${g.xlsx.trial.length},f=${g.xlsx.final.length},o=${g.xlsx.other.length}]`;
    console.log(
      `  [${row.client.code}] ${row.folder} / ${g.label} (${g.key}) ${tudSummary} ${xSummary}`
    );
  }
  if (dryRun) {
    console.log("Dry run - no writes.");
    return;
  }

  const log = {
    created_patterns: [],
    uploaded: [],
    measurements: [],
    skipped_files: [],
    finalized: [],
    failed: [],
    assumptions: [],
  };

  async function persist() {
    store.updated_at = nowIso();
    const { error } = await admin.from("erp_documents").upsert(
      { id: "pattern_library", data: store, updated_at: store.updated_at },
      { onConflict: "id" }
    );
    if (error) throw new Error(`pattern_library upsert failed: ${error.message}`);
    writeFileSync(LIBRARY_PATH, JSON.stringify(store, null, 2) + "\n");
  }

  for (const row of plan) {
    const g = row.group;
    const label = `${row.client.code} ${row.folder}/${g.label}`;
    try {
      let pattern = findExistingPattern(store, row.client, g);
      const trialXlsx = pickPrimaryXlsx(g, "trial");
      const finalXlsx = pickPrimaryXlsx(g, "final");
      let trialParsed = null;
      let finalParsed = null;
      if (trialXlsx) {
        try {
          trialParsed = parseXlsx(trialXlsx);
        } catch (err) {
          console.warn(`  xlsx warn ${basename(trialXlsx)}: ${err.message}`);
        }
      }
      if (finalXlsx) {
        try {
          finalParsed = parseXlsx(finalXlsx);
        } catch (err) {
          console.warn(`  xlsx warn ${basename(finalXlsx)}: ${err.message}`);
        }
      }
      const bestParsed = finalParsed?.ok ? finalParsed : trialParsed?.ok ? trialParsed : null;
      const hasFinalFiles = g.tuds.final.length > 0 || g.xlsx.final.length > 0;
      const hasTrialFiles = g.tuds.trial.length > 0 || g.xlsx.trial.length > 0;

      if (!pattern) {
        const ts = Date.now();
        const measSource = trialParsed?.ok ? trialParsed : bestParsed;
        const v1 = {
          id: `cpv-${ts}-1`,
          version: 1,
          is_final: false,
          trial_date:
            parseDateFromName(basename(g.tuds.trial[0] || trialXlsx || "")) ||
            measSource?.order_date ||
            null,
          measurements: buildMeasurements(store.dictionary, g.garment, measSource?.points),
          special_instructions: measSource?.special_instructions || null,
          notes: hasTrialFiles ? "Trial import from zipfiletrialandfinal_" : "Imported from zipfiletrialandfinal_",
          files: [],
          created_by: UPLOADED_BY,
          updated_by: UPLOADED_BY,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        const versions = [v1];
        let final_version_id = null;

        if (hasFinalFiles && hasTrialFiles) {
          const measFinal = finalParsed?.ok ? finalParsed : bestParsed;
          const v2 = {
            id: `cpv-${ts}-2`,
            version: 2,
            is_final: true,
            trial_date:
              parseDateFromName(basename(g.tuds.final[0] || finalXlsx || "")) ||
              measFinal?.order_date ||
              null,
            measurements: buildMeasurements(store.dictionary, g.garment, measFinal?.points),
            special_instructions: measFinal?.special_instructions || v1.special_instructions,
            notes: "Final import from zipfiletrialandfinal_",
            files: [],
            created_by: UPLOADED_BY,
            updated_by: UPLOADED_BY,
            created_at: nowIso(),
            updated_at: nowIso(),
          };
          versions.push(v2);
          final_version_id = v2.id;
        } else if (hasFinalFiles) {
          v1.is_final = true;
          v1.notes = "Final import from zipfiletrialandfinal_";
          if (finalParsed?.ok) {
            v1.measurements = buildMeasurements(store.dictionary, g.garment, finalParsed.points);
            v1.special_instructions = finalParsed.special_instructions || v1.special_instructions;
          }
          final_version_id = v1.id;
        }

        const sheetRef = bestParsed?.pattern_ref || null;
        const sizeHint = bestParsed?.size_label || null;
        pattern = {
          id: `cp-${ts}-${store.client_patterns.length + 1}`,
          pattern_ref: patternRef(g.garment, g.fabric, sizeHint, sheetRef),
          client_id: row.client.id,
          client_code: row.client.code,
          client_name: clientFullName(row.client),
          garment_type: g.garment,
          description: `${g.label} - imported from zipfiletrialandfinal_/${row.folder}`,
          base_pattern_id: null,
          base_size: null,
          house_brand_id: String(row.client.code || "").startsWith("GL") ? "gliani" : "fouad-rahme",
          house_brand_code: String(row.client.code || "").startsWith("GL") ? "GL" : "FR",
          fabric: g.fabric,
          linked_fabric_line_ids: [],
          unit: bestParsed?.unit || "in",
          versions,
          final_version_id,
          special_instructions: versions[versions.length - 1].special_instructions,
          physical_pattern_kept: false,
          physical_pattern_location: null,
          files: [],
          active_tud_file_id: null,
          active_tud_by_piece: {},
          notes: `Imported from zipfiletrialandfinal_/${row.folder}/${g.label}. Group key ${g.key}.`,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        store.client_patterns.push(pattern);
        log.created_patterns.push({ id: pattern.id, label, key: g.key });
        if (measSource?.filled_count) {
          log.measurements.push({ pattern_id: pattern.id, stage: "create", filled: measSource.filled_count });
        }
      } else {
        // Enrich existing
        if (g.fabric && !pattern.fabric) pattern.fabric = g.fabric;
        if (bestParsed?.pattern_ref && (!pattern.pattern_ref || /CUSTOM$/i.test(pattern.pattern_ref))) {
          pattern.pattern_ref = patternRef(g.garment, g.fabric, bestParsed.size_label, bestParsed.pattern_ref);
        }
        if (bestParsed?.unit) pattern.unit = bestParsed.unit;

        // Ensure trial + final versions when both stages present
        if (hasTrialFiles && hasFinalFiles && pattern.versions.length === 1) {
          const only = pattern.versions[0];
          const ts = Date.now();
          if (!only.is_final && !pattern.final_version_id) {
            // Keep v1 as trial; add final v2
            const measFinal = finalParsed?.ok ? finalParsed : null;
            const v2 = {
              id: `cpv-${ts}-2`,
              version: 2,
              is_final: true,
              trial_date:
                parseDateFromName(basename(g.tuds.final[0] || finalXlsx || "")) ||
                measFinal?.order_date ||
                null,
              measurements: measFinal?.ok
                ? buildMeasurements(store.dictionary, g.garment, measFinal.points)
                : (only.measurements || []).map((r) => ({ ...r })),
              special_instructions: measFinal?.special_instructions || only.special_instructions,
              notes: "Final import from zipfiletrialandfinal_",
              files: [],
              created_by: UPLOADED_BY,
              updated_by: UPLOADED_BY,
              created_at: nowIso(),
              updated_at: nowIso(),
            };
            pattern.versions = [only, v2];
            pattern.final_version_id = v2.id;
            log.assumptions.push(`${label}: added v2 final on existing pattern ${pattern.id}`);
            if (measFinal?.filled_count) {
              log.measurements.push({ pattern_id: pattern.id, stage: "final-v2", filled: measFinal.filled_count });
            }
          } else if (only.is_final || pattern.final_version_id) {
            // Existing was marked final; prepend/keep and ensure measurements
            log.assumptions.push(`${label}: existing single version already final on ${pattern.id}`);
          }
        }

        // Fill empty measurements
        const trialVer = pattern.versions[0];
        const finalVer =
          pattern.versions.find((v) => v.id === pattern.final_version_id) ||
          pattern.versions[pattern.versions.length - 1];

        if (trialParsed?.ok && trialVer) {
          const applied = applyMeasurements(
            trialVer,
            trialParsed,
            forceMeas,
            store.dictionary,
            g.garment
          );
          if (applied.filled) {
            pattern.versions = pattern.versions.map((v) => (v.id === trialVer.id ? applied.version : v));
            log.measurements.push({ pattern_id: pattern.id, stage: "trial", filled: applied.filled });
          }
        }
        if (finalParsed?.ok && finalVer) {
          const applied = applyMeasurements(
            finalVer,
            finalParsed,
            forceMeas || finalVer.id !== trialVer?.id,
            store.dictionary,
            g.garment
          );
          if (applied.filled) {
            pattern.versions = pattern.versions.map((v) => (v.id === finalVer.id ? applied.version : v));
            log.measurements.push({ pattern_id: pattern.id, stage: "final", filled: applied.filled });
          }
        }

        if (hasFinalFiles && !pattern.final_version_id) {
          const target = pattern.versions[pattern.versions.length - 1];
          pattern.versions = pattern.versions.map((v) => ({
            ...v,
            is_final: v.id === target.id,
          }));
          pattern.final_version_id = target.id;
          log.finalized.push({ pattern_id: pattern.id, version_id: target.id });
        }
      }

      const trialVersion = pattern.versions[0];
      const finalVersion =
        pattern.versions.find((v) => v.id === pattern.final_version_id) ||
        pattern.versions[pattern.versions.length - 1];

      // Upload TUDs: trial -> trial version; final/other -> pattern files (active = latest final)
      const tudJobs = [
        ...g.tuds.trial.map((p) => ({ path: p, versionId: trialVersion?.id || null, stage: "trial" })),
        ...g.tuds.other.map((p) => ({ path: p, versionId: trialVersion?.id || null, stage: "other" })),
        ...g.tuds.final.map((p) => ({ path: p, versionId: null, stage: "final" })),
      ];

      for (const job of tudJobs) {
        const filename = basename(job.path);
        if (hasFilename(pattern, filename)) {
          log.skipped_files.push({ label, file: filename, reason: "already attached" });
          continue;
        }
        const piece = pieceNameFromPath(job.path, g.garment);
        const att = await makeAttachment(admin, job.path, pattern.id, piece);
        if (att.tud?.sizes?.[0] && !pattern.base_size) pattern.base_size = att.tud.sizes[0];

        if (job.versionId) {
          pattern.versions = pattern.versions.map((v) =>
            v.id === job.versionId
              ? {
                  ...v,
                  files: [...(v.files || []), att],
                  notes: [v.notes, `${job.stage} TUD: ${filename}`].filter(Boolean).join(" | "),
                  updated_at: nowIso(),
                }
              : v
          );
        } else {
          pattern.files = [...(pattern.files || []), att];
        }

        if (att.kind === "tud") {
          pattern.active_tud_file_id = att.id;
          if (piece) {
            pattern.active_tud_by_piece = { ...(pattern.active_tud_by_piece || {}), [piece]: att.id };
          }
        }

        log.uploaded.push({
          pattern_id: pattern.id,
          label,
          file: filename,
          stage: job.stage,
          version_id: job.versionId,
          piece,
        });
        console.log(`  OK TUD ${label} <- ${filename} (${job.stage})`);
      }

      // Prefer final TUD as active when present
      const finalTuds = (pattern.files || []).filter(
        (f) => f.kind === "tud" && pathKind(f.filename) === "final"
      );
      if (finalTuds.length) {
        const last = finalTuds[finalTuds.length - 1];
        pattern.active_tud_file_id = last.id;
        const piece = last.piece_name || pieceNameFromPath(last.filename, g.garment);
        if (piece) {
          pattern.active_tud_by_piece = { ...(pattern.active_tud_by_piece || {}), [piece]: last.id };
        }
      }

      // Attach all xlsx (pattern-level)
      const allXlsx = [...new Set([...g.xlsx.trial, ...g.xlsx.final, ...g.xlsx.other])];
      for (const xPath of allXlsx) {
        const filename = basename(xPath);
        if (hasFilename(pattern, filename)) {
          log.skipped_files.push({ label, file: filename, reason: "already attached" });
          continue;
        }
        const att = await makeAttachment(admin, xPath, pattern.id, null);
        pattern.files = [...(pattern.files || []), att];
        log.uploaded.push({
          pattern_id: pattern.id,
          label,
          file: filename,
          stage: pathKind(xPath),
          version_id: null,
          piece: null,
        });
        console.log(`  OK XLSX ${label} <- ${filename}`);
      }

      // If we created measurements on create path already counted; for brand-new with only xlsx+no tud still ok
      pattern.updated_at = nowIso();
      const idx = store.client_patterns.findIndex((p) => p.id === pattern.id);
      store.client_patterns[idx] = pattern;

      await persist();
      console.log(`PERSISTED ${label} -> ${pattern.id} (versions=${pattern.versions.length}, final=${pattern.final_version_id})`);
    } catch (err) {
      log.failed.push({ label, error: String(err.message || err) });
      console.error(`FAIL ${label}:`, err.message || err);
    }
  }

  const summaryPath = "/tmp/zipfile-trial-final-import-log.json";
  writeFileSync(summaryPath, JSON.stringify(log, null, 2));
  console.log("\nDone.");
  console.log(`  created patterns: ${log.created_patterns.length}`);
  console.log(`  uploaded files: ${log.uploaded.length}`);
  console.log(`  measurement fills: ${log.measurements.length}`);
  console.log(`  skipped files: ${log.skipped_files.length}`);
  console.log(`  finalized: ${log.finalized.length}`);
  console.log(`  failed: ${log.failed.length}`);
  console.log(`  assumptions: ${log.assumptions.length}`);
  console.log(`  log: ${summaryPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
