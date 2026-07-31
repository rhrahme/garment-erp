/**
 * Re-scan Mahrab pattern archive vs production Pattern Library.
 * Report TUD + measurement gaps, then upload/fill clear wins (idempotent).
 *
 * Usage:
 *   node --import /tmp/ts-resolve-loader.mjs scripts/fill-mahrab-tud-measurements-gaps.mjs
 *   node --import /tmp/ts-resolve-loader.mjs scripts/fill-mahrab-tud-measurements-gaps.mjs --dry-run
 *   node --import /tmp/ts-resolve-loader.mjs scripts/fill-mahrab-tud-measurements-gaps.mjs --apply
 *   node --import /tmp/ts-resolve-loader.mjs scripts/fill-mahrab-tud-measurements-gaps.mjs --root "/Users/ralphrahme/Downloads/Mahrab pattern"
 *
 * Default: --apply (live Supabase writes). Use --dry-run to report only.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { parseTudFile } from "../src/lib/pattern-library/tud-parser.ts";

const DEFAULT_ROOT = "/Users/ralphrahme/Downloads/Mahrab pattern";
let ROOT = DEFAULT_ROOT;
const LIBRARY_PATH = resolve("src/data/pattern-library.json");
const CLIENTS_PATH = resolve("src/data/clients.json");
const JOBS_PATH = resolve("src/data/pattern-jobs.json");
const XLSX_PARSER = resolve("scripts/lib/parse-client-measurement-xlsx.py");
const PDF_RENDERER = resolve("scripts/lib/render-mahrab-gap-report.py");
const BUCKET = "erp-pattern-files";
const UPLOADED_BY = "info@hagan.pro";
const PRESERVE_PATTERN_ID = "cp-1784935127357-1";
const REPORT_JSON = "/Users/ralphrahme/Downloads/mahrab-tud-measurements-gap-report.json";
const REPORT_PDF = "/Users/ralphrahme/Downloads/mahrab-tud-measurements-gap-report.pdf";
const RUN_LOG = "/tmp/mahrab-tud-measurements-gap-run.json";

/** Minimum filled base/target rows to consider measurements "OK" (not sparse). */
const MIN_FILLED_OK = 4;

const SKIP_TOP = new Set([
  "marker",
  "copy",
  "new folder",
  "3d clo",
  "pattern",
  "update",
  "100 cm callibration.tud",
]);

const BASE_FAMILY = new Set(
  [
    "beirut all",
    "bencivenga",
    "blue mint",
    "boggy all pattern",
    "boss brand",
    "cafe cotton",
    "collar + band",
    "camicissima",
    "grandfather",
    "grey jacket",
    "hindiya",
    "luca faloni",
    "massimo all",
    "pink pant set",
    "raglan",
    "red short",
    "stripe short",
    "suit supply",
    "suit supply all pattern",
    "tj just uniform pattern",
    "vest",
    "white shirt",
    "zegna",
    "zara",
    "6666-blazer",
  ].map((s) => s.toLowerCase())
);

const FORCE_MATCH = {
  "Ajlan Mohammad Al Ajlan": "FR-0626-0035",
  "Abdel Aziz Mohamad Al Ajlan": "FR-0726-0039",
  "Abdel Aziz Ajlan Al Ajlan": "FR-0726-0038",
  "Abdel Aziz Fahd Al Ajlan": "FR-0426-0006",
  "Sheikh Mohamad Al Ajlan": "FR-0726-0054",
  "Ibrahim Al Shwemi": "FR-0726-0037",
  "Moid Al Zahrani (Abu Mazen)": "FR-0526-0029",
  "Prince Khaled": "FR-0626-0037",
  "Abdelillah Al Sheikh": "FR-0526-0027",
  "Abdelillah Abou Nayan": "FR-0326-0004",
  "Elie Sir": "GL-0326-0004",
  "RADDAT AL ZAHRANI": "FR-0226-0022",
  "Abdul Majid Al Zahrani": "FR-0226-0026",
  "SALMAN ASIMI": "FR-0626-0036",
  "Mishari Al Kadhi": "GL-0626-0011",
  "MOHAMAD AL ANEZZI MOUGEB": "FR-0226-0001",
  "FAISAL ABOU NAYAN": "FR-0226-0017",
  "PATRICK RAUPACH": "GL-0326-0003",
  "Sherrif Dabbous": "FR-0226-0009",
  "Mahmoud": "GL-0326-0006",
  "Mark": "FR-0226-0016",
  "Fahad Al Othebi": "FR-0726-0040",
  "Faisal Al Rashed": "FR-0726-0041",
  "Farhan": "FR-0726-0042",
  "Hicham Al Saif": "FR-0726-0043",
  "Josep Al Aminos": "FR-0726-0044",
  "Mahrab": "FR-0726-0045",
  "Mitwalli": "FR-0726-0046",
  "Mohammad Al Sheikh (MOE)": "FR-0726-0047",
  "Mohammad Sagor": "FR-0726-0048",
  "Nayef": "FR-0726-0049",
  "NUHAD HAMDAN": "FR-0726-0050",
  "Raed Al Souelih": "FR-0726-0051",
  "Saud Al Othebi": "FR-0726-0052",
  "Tony Helou": "FR-0726-0053",
  "Khaled Al Omair": "FR-0726-0055",
};

const FORCE_SKIP = new Set(["Sami Al Jameel"]);

const GARMENT_HINTS = [
  ["short sleeve", "shirt"],
  ["short slv", "shirt"],
  ["over shirt", "shirt"],
  ["overshirt", "shirt"],
  ["double breasted", "jacket"],
  ["single breasted", "jacket"],
  ["peak lapel", "jacket"],
  ["over coat", "jacket"],
  ["overcoat", "jacket"],
  ["short pant", "shorts"],
  ["linen short", "shorts"],
  ["shorts", "shorts"],
  ["chino", "trouser"],
  ["kurta", "shirt"],
  ["shirt", "shirt"],
  ["jacket", "jacket"],
  ["blazer", "jacket"],
  ["trouser", "trouser"],
  ["pant", "trouser"],
  ["thobe", "thobe"],
  ["vest", "vest"],
  ["suit", "suit"],
  ["short", "shorts"],
];

/** Soft aliases: sheet garment_type <-> library garment_type */
const GARMENT_ALIASES = {
  short: ["shorts", "short"],
  shorts: ["shorts", "short"],
  shirt: ["shirt", "overshirt"],
  overshirt: ["overshirt", "shirt"],
  trouser: ["trouser", "trousers"],
  trousers: ["trouser", "trousers"],
  pant: ["trouser"],
  pants: ["trouser"],
  jacket: ["jacket", "blazer"],
  blazer: ["jacket", "blazer"],
  thobe: ["thobe", "formal thobe", "house thobe"],
};

function loadEnv() {
  const envPath = resolve(".env.local");
  if (!existsSync(envPath)) throw new Error(".env.local not found");
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

function detectGarment(...texts) {
  const t = texts.join(" ").toLowerCase();
  for (const [hint, g] of GARMENT_HINTS) {
    if (t.includes(hint)) return g;
  }
  return "custom";
}

function detectFabric(...texts) {
  const t = texts.join(" ");
  const low = t.toLowerCase();
  const code =
    t.match(/\bBOL\.?\s*0*\d{2,4}\b/i)?.[0] ||
    t.match(/\bN\d{5,7}\b/i)?.[0] ||
    t.match(/\b7\d{5}\b/)?.[0] ||
    null;
  let fiber = null;
  if (low.includes("loro piana") || low.includes("lora piana")) fiber = "Loro Piana";
  else if (low.includes("linen")) fiber = "Linen";
  else if (low.includes("cotton")) fiber = "Cotton";
  else if (low.includes("wool")) fiber = "Wool";
  if (fiber && code) return `${fiber} ${code.replace(/\s+/g, "")}`;
  if (fiber) return fiber;
  if (code) return code.replace(/\s+/g, "");
  return null;
}

function pathKind(relPath) {
  const parts = relPath.split(/[/\\]/).map((p) => p.toLowerCase());
  if (parts.some((p) => p.includes("final"))) return "final";
  if (parts.some((p) => p.includes("trial"))) return "trial";
  return "other";
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

function fuzzyMatch(folderName, clients) {
  if (FORCE_SKIP.has(folderName)) return null;
  if (FORCE_MATCH[folderName]) {
    const code = FORCE_MATCH[folderName];
    const hit = clients.find((c) => c.code === code);
    if (hit) return { client: hit, score: 1, forced: true };
  }
  const fs = slug(folderName);
  const ftoks = new Set(fs.split(" ").filter(Boolean));
  const drop = new Set(["mr", "sheikh", "prince", "pr", "abu", "moe", "bin"]);
  let best = null;
  let bestScore = 0;
  for (const c of clients) {
    if (String(c.code || "").startsWith("RM-")) continue;
    const cs = slug(clientFullName(c));
    const ctoks = new Set(cs.split(" ").filter((t) => !drop.has(t)));
    const f2 = new Set([...ftoks].filter((t) => !drop.has(t)));
    const inter = [...f2].filter((t) => ctoks.has(t)).length;
    const union = new Set([...f2, ...ctoks]).size || 1;
    const jacc = inter / union;
    let same = 0;
    const a = fs.replace(/mohammad/g, "mohamad").replace(/abdelaziz/g, "abdel aziz");
    const b = cs
      .replace(/mohammad/g, "mohamad")
      .replace(/abdelaziz/g, "abdel aziz")
      .replace(/abdulaziz/g, "abdel aziz");
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    if (longer.includes(shorter) && shorter.length > 6) same = 0.85;
    const score = Math.max(jacc + (same ? 0.2 : 0), same);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best || bestScore < 0.72) return null;
  const last = [...ftoks].filter((t) => !drop.has(t)).pop();
  const clientLast = slug(best.last_name || "").split(" ").pop();
  if (last && clientLast && last !== clientLast && bestScore < 0.9) return null;
  return { client: best, score: bestScore, forced: false };
}

function garmentKeys(garment) {
  const g = String(garment || "").toLowerCase();
  const aliases = GARMENT_ALIASES[g] || [g];
  return new Set(aliases.map((x) => x.toLowerCase()));
}

function pickGarmentGroups(clientDir) {
  const files = walkFiles(clientDir).filter((f) => {
    const ext = extname(f).toLowerCase();
    return ext === ".tud" || ext === ".xlsx" || ext === ".xls";
  });
  /** @type {Map<string, {tud: string[], xlsx: string[]}>} */
  const groups = new Map();
  for (const full of files) {
    const rel = relative(clientDir, full);
    const name = basename(full);
    const fromName = detectGarment(name);
    const garment = fromName !== "custom" ? fromName : detectGarment(rel);
    if (!groups.has(garment)) groups.set(garment, { tud: [], xlsx: [] });
    const g = groups.get(garment);
    if (extname(full).toLowerCase() === ".tud") g.tud.push(full);
    else g.xlsx.push(full);
  }
  return groups;
}

function pickBestTud(paths) {
  if (!paths.length) return { final: null, trial: null, other: null };
  const ranked = paths.map((p) => {
    const kind = pathKind(p);
    const mtime = statSync(p).mtimeMs;
    return { p, kind, mtime };
  });
  const finals = ranked.filter((r) => r.kind === "final").sort((a, b) => b.mtime - a.mtime);
  const trials = ranked.filter((r) => r.kind === "trial").sort((a, b) => b.mtime - a.mtime);
  const others = ranked.filter((r) => r.kind === "other").sort((a, b) => b.mtime - a.mtime);
  return {
    final: finals[0]?.p ?? null,
    trial: trials[0]?.p ?? null,
    other: others[0]?.p ?? null,
  };
}

function pickBestXlsx(xlsxPaths, preferTudPath = null) {
  if (!xlsxPaths.length) return null;
  if (preferTudPath) {
    const dir = dirname(preferTudPath);
    const stem = basename(preferTudPath, ".tud").toLowerCase().replace(/\s+/g, " ").trim();
    const sameDir = xlsxPaths.filter((p) => dirname(p) === dir);
    const pool = sameDir.length ? sameDir : xlsxPaths;
    const byStem = pool.find((p) =>
      basename(p, extname(p)).toLowerCase().includes(stem.slice(0, 20))
    );
    if (byStem) return byStem;
  }
  const scored = xlsxPaths.map((p) => {
    const n = basename(p).toLowerCase();
    let score = 0;
    if (n.includes("final")) score += 3;
    if (n.includes("trial")) score -= 1;
    score += statSync(p).mtimeMs / 1e15;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.p ?? null;
}

function contentTypeFor(filename) {
  const ext = extname(filename).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/octet-stream";
}

function kindFor(filename) {
  const ext = extname(filename).toLowerCase().slice(1);
  if (ext === "tud") return "tud";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  return "other";
}

function patternRef(garment, fabric, size) {
  const bits = [garment.toUpperCase()];
  if (fabric) bits.push(fabric.toUpperCase());
  bits.push("CUSTOM");
  if (size) bits.push(String(size).toUpperCase());
  return bits.join("-");
}

function buildMeasurements(dictionary, garmentType) {
  const points = (dictionary || []).filter((p) => (p.garment_types || []).includes(garmentType));
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

function latestVersion(pattern) {
  if (!pattern?.versions?.length) return null;
  if (pattern.final_version_id) {
    const fv = pattern.versions.find((v) => v.id === pattern.final_version_id);
    if (fv) return fv;
  }
  return [...pattern.versions].sort((a, b) => (b.version || 0) - (a.version || 0))[0];
}

function countFilled(measurements) {
  return (measurements || []).filter(
    (m) => m.base_value != null || m.target_value != null || m.sewn_value != null
  ).length;
}

function hasTud(pattern) {
  const files = [
    ...(pattern.files || []),
    ...(pattern.versions || []).flatMap((v) => v.files || []),
  ];
  return files.some((f) => f.kind === "tud" || /\.tud$/i.test(f.filename || ""));
}

function findPatternsForClientGarment(store, clientId, garment) {
  const keys = garmentKeys(garment);
  return (store.client_patterns || []).filter(
    (p) => p.client_id === clientId && keys.has(String(p.garment_type || "").toLowerCase())
  );
}

function pickPrimaryPattern(patterns, garment) {
  if (!patterns.length) return null;
  if (
    garment === "shorts" &&
    patterns.some((p) => p.id === PRESERVE_PATTERN_ID)
  ) {
    return patterns.find((p) => p.id === PRESERVE_PATTERN_ID);
  }
  // Prefer one that already has tud, else most recently updated
  const withTud = patterns.filter(hasTud);
  const pool = withTud.length ? withTud : patterns;
  return [...pool].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0];
}


function pickParsableXlsx(xlsxPaths, preferTudPath = null) {
  if (!xlsxPaths.length) return { path: null, parsed: null };
  const preferred = pickBestXlsx(xlsxPaths, preferTudPath);
  const ordered = preferred
    ? [preferred, ...xlsxPaths.filter((p) => p !== preferred)]
    : [...xlsxPaths].sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  let lastErr = null;
  for (const path of ordered) {
    try {
      const parsed = parseXlsx(path);
      if (parsed?.ok && (parsed.filled_count || 0) > 0) {
        return { path, parsed };
      }
      if (parsed?.ok) lastErr = "xlsx has no filled size values";
      else lastErr = parsed?.error || "parse failed";
    } catch (err) {
      lastErr = String(err.message || err);
    }
  }
  return { path: preferred || ordered[0] || null, parsed: null, error: lastErr };
}

function parseXlsx(xlsxPath) {
  const res = spawnSync("python3", [XLSX_PARSER, xlsxPath], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || "xlsx parse failed").slice(0, 400));
  }
  const data = JSON.parse(res.stdout);
  return Array.isArray(data) ? data[0] : data;
}

function mergeMeasurementsFillEmpty(existing, sheetPoints) {
  const bySource = new Map(sheetPoints.map((p) => [normName(p.name), p]));
  const used = new Set();
  const merged = (existing || []).map((row) => {
    const source = bySource.get(normName(row.name));
    if (!source) return row;
    used.add(normName(source.name));
    const next = { ...row };
    // Only fill null/empty cells; never overwrite with null/empty
    if ((next.base_value == null || next.base_value === "") && source.base_value != null) {
      next.base_value = source.base_value;
    }
    if ((next.target_value == null || next.target_value === "") && (source.target_value != null || source.base_value != null)) {
      next.target_value = source.target_value ?? source.base_value;
    }
    if ((next.sewn_value == null || next.sewn_value === "") && source.final_value != null) {
      next.sewn_value = source.final_value;
    }
    if (!next.remarks && source.remarks) next.remarks = source.remarks;
    return next;
  });

  // If template empty/sparse, append unmatched source points that have values
  for (const point of sheetPoints) {
    if (used.has(normName(point.name))) continue;
    if (point.base_value == null && point.target_value == null && point.final_value == null) continue;
    if (merged.some((r) => normName(r.name) === normName(point.name))) continue;
    merged.push({
      point_id: point.point_id || slugify(point.name),
      name: point.name,
      remark: null,
      is_graded: true,
      base_value: point.base_value ?? null,
      target_value: point.target_value ?? point.base_value ?? null,
      sewn_value: point.final_value ?? null,
      adjustment: null,
      remarks: point.remarks ?? null,
    });
  }
  return merged;
}

function pointsToMeasurements(points) {
  return (points || []).map((point) => ({
    point_id: point.point_id || slugify(point.name),
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

async function notify(event, data) {
  const url = process.env.ZAPIER_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        timestamp: nowIso(),
        source: "erp",
        data: { ...data, _source: "erp" },
      }),
    });
    if (!res.ok) console.warn(`  Zapier ${event}: HTTP ${res.status}`);
  } catch (err) {
    console.warn(`  Zapier ${event} failed: ${err.message}`);
  }
}

function jobGarmentKeys(jobGarment) {
  const raw = String(jobGarment || "").toLowerCase().trim();
  const keys = new Set([raw]);
  // Normalize common job labels
  if (raw === "short" || raw === "shorts") {
    keys.add("short");
    keys.add("shorts");
  }
  if (raw.includes("shirt")) keys.add("shirt");
  if (raw.includes("trouser") || raw.includes("pant")) keys.add("trouser");
  if (raw.includes("jacket") || raw.includes("blazer")) keys.add("jacket");
  if (raw.includes("thobe")) keys.add("thobe");
  if (raw.includes("vest")) keys.add("vest");
  if (raw.includes("suit")) keys.add("suit");
  for (const k of [...keys]) {
    for (const a of GARMENT_ALIASES[k] || []) keys.add(a);
  }
  return keys;
}

function createEmptyPattern(store, client, garment, sourceNote) {
  const ts = Date.now();
  const version = {
    id: `cpv-${ts}-1`,
    version: 1,
    is_final: true,
    trial_date: null,
    measurements: buildMeasurements(store.dictionary, garment),
    special_instructions: null,
    notes: null,
    files: [],
    created_by: UPLOADED_BY,
    updated_by: UPLOADED_BY,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const fabric = null;
  const pattern = {
    id: `cp-${ts}-${store.client_patterns.length + 1}`,
    pattern_ref: patternRef(garment, fabric, null),
    client_id: client.id,
    client_code: client.code,
    client_name: clientFullName(client),
    garment_type: garment,
    description: `${garment} pattern from Mahrab gap fill`,
    base_pattern_id: null,
    base_size: null,
    house_brand_id: String(client.code || "").startsWith("GL") ? "gliani" : "fouad-rahme",
    house_brand_code: String(client.code || "").startsWith("GL") ? "GL" : "FR",
    fabric,
    linked_fabric_line_ids: [],
    unit: "in",
    versions: [version],
    final_version_id: version.id,
    special_instructions: null,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    files: [],
    notes: sourceNote,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  store.client_patterns.push(pattern);
  return pattern;
}

function renderPdf(report) {
  if (!existsSync(PDF_RENDERER)) {
    console.warn(`PDF renderer missing: ${PDF_RENDERER}`);
    return false;
  }
  const tmpJson = "/tmp/mahrab-gap-report-for-pdf.json";
  writeFileSync(tmpJson, JSON.stringify(report));
  const res = spawnSync("python3", [PDF_RENDERER, tmpJson, REPORT_PDF], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (res.status !== 0) {
    console.warn(`PDF render failed: ${(res.stderr || res.stdout || "").slice(0, 500)}`);
    return false;
  }
  return true;
}

async function main() {
  loadEnv();
  const argv = process.argv.slice(2);
  const args = new Set(argv);
  const dryRun = args.has("--dry-run");
  const apply = args.has("--apply") || !dryRun;
  const rootIdx = argv.indexOf("--root");
  if (rootIdx >= 0 && argv[rootIdx + 1]) ROOT = resolve(argv[rootIdx + 1]);
  if (!existsSync(ROOT)) throw new Error(`Root not found: ${ROOT}`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  console.log(`Root: ${ROOT}`);
  console.log(`Mode: ${dryRun ? "DRY-RUN (report only)" : "APPLY (live Supabase writes)"}`);

  // Clients: prefer live
  const { data: clientsRow, error: clientsErr } = await admin
    .from("erp_documents")
    .select("data")
    .eq("id", "clients")
    .maybeSingle();
  if (clientsErr) throw clientsErr;
  let clients = clientsRow?.data?.clients || [];
  if (!clients.length && existsSync(CLIENTS_PATH)) {
    clients = JSON.parse(readFileSync(CLIENTS_PATH, "utf8")).clients || [];
  }
  console.log(`Clients loaded: ${clients.length}`);

  const { data: remoteRow, error: remoteErr } = await admin
    .from("erp_documents")
    .select("data, updated_at")
    .eq("id", "pattern_library")
    .maybeSingle();
  if (remoteErr) throw remoteErr;
  const store = remoteRow?.data || { dictionary: [], base_patterns: [], client_patterns: [] };
  console.log(
    `Library: bases=${(store.base_patterns || []).length} dict=${(store.dictionary || []).length} cps=${(store.client_patterns || []).length}`
  );

  const { data: jobsRow, error: jobsErr } = await admin
    .from("erp_documents")
    .select("data")
    .eq("id", "pattern_jobs")
    .maybeSingle();
  if (jobsErr) throw jobsErr;
  const jobsDoc = jobsRow?.data || { jobs: [] };

  // Classify top-level folders
  const top = readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.name !== ".DS_Store")
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const skippedReference = [];
  const skippedJunk = [];
  const clientFolders = [];
  for (const name of top) {
    const low = name.toLowerCase();
    const full = join(ROOT, name);
    const isDir = existsSync(full) && statSync(full).isDirectory();
    if (SKIP_TOP.has(low) || (!isDir && low.endsWith(".tud") && low.includes("callibrat"))) {
      skippedJunk.push(name);
      continue;
    }
    if (BASE_FAMILY.has(low)) {
      skippedReference.push(name);
      continue;
    }
    if (!isDir) {
      skippedJunk.push(name);
      continue;
    }
    clientFolders.push(name);
  }

  const unmatchedFolders = [];
  const matchedFolders = [];
  /** @type {any[]} */
  const rows = [];

  for (const folder of clientFolders) {
    const match = fuzzyMatch(folder, clients);
    if (!match) {
      unmatchedFolders.push(folder);
      continue;
    }
    matchedFolders.push({
      folder,
      code: match.client.code,
      client_id: match.client.id,
      score: match.score,
      forced: match.forced,
    });
    const groups = pickGarmentGroups(join(ROOT, folder));
    for (const [garment, files] of groups) {
      if (!files.tud.length && !files.xlsx.length) continue;
      const pick = pickBestTud(files.tud);
      const primaryTud = pick.final || pick.other || pick.trial;
      const xlsx = pickBestXlsx(files.xlsx, primaryTud);
      const xlsxAll = files.xlsx;
      const patterns = findPatternsForClientGarment(store, match.client.id, garment);
      const pattern = pickPrimaryPattern(patterns, garment);
      const version = pattern ? latestVersion(pattern) : null;
      const filled = version ? countFilled(version.measurements) : 0;
      const totalRows = version?.measurements?.length || 0;
      const libHasTud = pattern ? hasTud(pattern) : false;
      const sourceHasTud = files.tud.length > 0;
      const sourceHasXlsx = files.xlsx.length > 0;
      const measurementsFilled = filled >= MIN_FILLED_OK;
      const measurementsSparse = sourceHasXlsx && (!pattern || filled < MIN_FILLED_OK);

      const shouldUploadTud = sourceHasTud && (!pattern || !libHasTud);
      const shouldFillMeasurements = sourceHasXlsx && measurementsSparse;

      let status = "OK";
      if (!pattern && (sourceHasTud || sourceHasXlsx)) status = "MISSING_PATTERN";
      else if (shouldUploadTud && shouldFillMeasurements) status = "NEED_TUD_AND_MEASUREMENTS";
      else if (shouldUploadTud) status = "NEED_TUD";
      else if (shouldFillMeasurements) status = "NEED_MEASUREMENTS";
      else if (libHasTud && measurementsFilled) status = "OK";
      else if (libHasTud && !sourceHasXlsx) status = "OK_TUD_NO_XLSX_SOURCE";
      else if (!libHasTud && !sourceHasTud && measurementsFilled) status = "OK_MEASUREMENTS_NO_TUD_SOURCE";

      rows.push({
        folder,
        client_code: match.client.code,
        client_id: match.client.id,
        client_name: clientFullName(match.client),
        garment,
        match_score: match.score,
        forced: match.forced,
        HAS_TUD_IN_SOURCE: sourceHasTud,
        HAS_XLSX_IN_SOURCE: sourceHasXlsx,
        HAS_TUD_IN_LIBRARY: libHasTud,
        HAS_MEASUREMENTS_FILLED: measurementsFilled,
        filled_count: filled,
        measurement_rows: totalRows,
        pattern_id: pattern?.id || null,
        pattern_ref: pattern?.pattern_ref || null,
        source_tud: primaryTud ? relative(ROOT, primaryTud) : null,
        source_xlsx: xlsx ? relative(ROOT, xlsx) : null,
        source_xlsx_all: xlsxAll.map((p) => relative(ROOT, p)),
        source_tud_count: files.tud.length,
        source_xlsx_count: files.xlsx.length,
        SHOULD_UPLOAD_TUD: shouldUploadTud,
        SHOULD_FILL_MEASUREMENTS: shouldFillMeasurements,
        status,
      });
    }
  }

  const summary = {
    scanned_client_folders: clientFolders.length,
    matched_client_folders: matchedFolders.length,
    unmatched_client_folders: unmatchedFolders.length,
    skipped_reference: skippedReference.length,
    skipped_junk: skippedJunk.length,
    garment_rows: rows.length,
    already_ok: rows.filter((r) => r.status === "OK" || r.status.startsWith("OK_")).length,
    need_tud: rows.filter((r) => r.SHOULD_UPLOAD_TUD).length,
    need_measurements: rows.filter((r) => r.SHOULD_FILL_MEASUREMENTS).length,
    missing_pattern: rows.filter((r) => r.status === "MISSING_PATTERN").length,
    source_tud_rows: rows.filter((r) => r.HAS_TUD_IN_SOURCE).length,
    source_xlsx_rows: rows.filter((r) => r.HAS_XLSX_IN_SOURCE).length,
  };

  console.log("\n=== SCAN SUMMARY ===");
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`);
  if (unmatchedFolders.length) {
    console.log(`  unmatched: ${unmatchedFolders.join(", ")}`);
  }

  const actions = {
    tud_uploaded: [],
    measurements_filled: [],
    patterns_created: [],
    jobs_linked: [],
    skipped: [],
    failed: [],
  };

  let dirtyLibrary = false;
  let dirtyJobs = false;

  async function persistLibrary() {
    store.updated_at = nowIso();
    const { error } = await admin.from("erp_documents").upsert(
      { id: "pattern_library", data: store, updated_at: store.updated_at },
      { onConflict: "id" }
    );
    if (error) throw new Error(`pattern_library upsert failed: ${error.message}`);
    writeFileSync(LIBRARY_PATH, JSON.stringify(store, null, 2) + "\n");
    dirtyLibrary = false;
  }

  async function persistJobs() {
    jobsDoc.updated_at = nowIso();
    const { error } = await admin.from("erp_documents").upsert(
      { id: "pattern_jobs", data: jobsDoc, updated_at: jobsDoc.updated_at },
      { onConflict: "id" }
    );
    if (error) throw new Error(`pattern_jobs upsert failed: ${error.message}`);
    writeFileSync(JOBS_PATH, JSON.stringify(jobsDoc, null, 2) + "\n");
    dirtyJobs = false;
  }

  if (apply && !dryRun) {
    const work = rows.filter((r) => r.SHOULD_UPLOAD_TUD || r.SHOULD_FILL_MEASUREMENTS);
    console.log(`\n=== APPLY ${work.length} clear-win row(s) ===`);

    for (let i = 0; i < work.length; i++) {
      const row = work[i];
      const label = `${row.client_code} ${row.folder}/${row.garment}`;
      try {
        let pattern = row.pattern_id
          ? store.client_patterns.find((p) => p.id === row.pattern_id)
          : null;

        // Create pattern if missing and we have source material
        if (!pattern) {
          const client = clients.find((c) => c.id === row.client_id);
          if (!client) throw new Error(`client ${row.client_id} not found`);
          const note = `Created by fill-mahrab-tud-measurements-gaps from Mahrab pattern/${row.folder}`;
          pattern = createEmptyPattern(store, client, row.garment, note);
          actions.patterns_created.push({ label, pattern_id: pattern.id });
          dirtyLibrary = true;
          console.log(`CREATE pattern ${label} -> ${pattern.id}`);
        }

        // Upload TUD if needed
        if (row.SHOULD_UPLOAD_TUD && row.source_tud && !hasTud(pattern)) {
          const tudPath = join(ROOT, row.source_tud);
          if (!existsSync(tudPath)) throw new Error(`TUD missing on disk: ${tudPath}`);
          const already = (pattern.files || []).some((f) => f.filename === basename(tudPath));
          if (already) {
            actions.skipped.push({ label, reason: "tud filename already attached" });
          } else {
            const att = await makeAttachment(admin, tudPath, pattern.id);
            pattern.files = [...(pattern.files || []), att];
            pattern.active_tud_file_id = att.id;
            if (att.tud?.sizes?.[0] && !pattern.base_size) pattern.base_size = att.tud.sizes[0];
            const fabric = detectFabric(tudPath, row.folder);
            if (fabric && !pattern.fabric) pattern.fabric = fabric;
            pattern.updated_at = nowIso();
            actions.tud_uploaded.push({
              label,
              pattern_id: pattern.id,
              file: basename(tudPath),
            });
            dirtyLibrary = true;
            console.log(`TUD OK (${i + 1}/${work.length}) ${label} <- ${basename(tudPath)}`);
            await notify("pattern_library.file_uploaded", {
              client_pattern_id: pattern.id,
              file_id: att.id,
              filename: att.filename,
              kind: "tud",
              uploaded_by: UPLOADED_BY,
            });
          }
        } else if (row.SHOULD_UPLOAD_TUD && hasTud(pattern)) {
          actions.skipped.push({ label, reason: "tud already present (race/idempotent)" });
        }

        // Fill measurements if needed
        if (row.SHOULD_FILL_MEASUREMENTS && (row.source_xlsx || (row.source_xlsx_all || []).length)) {
          const candidates = (row.source_xlsx_all || [row.source_xlsx]).filter(Boolean).map((rel) => join(ROOT, rel));
          const pick = pickParsableXlsx(candidates, row.source_tud ? join(ROOT, row.source_tud) : null);
          const xlsxPath = pick.path;
          const parsed = pick.parsed;
          if (!xlsxPath || !existsSync(xlsxPath)) {
            actions.failed.push({ label, error: `xlsx missing on disk` });
            console.error(`FAIL missing xlsx ${label}`);
          } else if (!parsed?.ok) {
            actions.skipped.push({ label, reason: pick.error || "xlsx has no filled size values" });
            console.log(`SKIP meas ${label}: ${pick.error || "xlsx empty of values"}`);
          } else {
            // Attach xlsx if missing
            const xName = basename(xlsxPath);
            if (!(pattern.files || []).some((f) => f.filename === xName)) {
              const xAtt = await makeAttachment(admin, xlsxPath, pattern.id);
              pattern.files = [...(pattern.files || []), xAtt];
              await notify("pattern_library.file_uploaded", {
                client_pattern_id: pattern.id,
                file_id: xAtt.id,
                filename: xAtt.filename,
                kind: "xlsx",
                uploaded_by: UPLOADED_BY,
              });
            }

            let version = latestVersion(pattern);
            if (!version) {
              version = {
                id: `cpv-${Date.now()}-1`,
                version: 1,
                is_final: true,
                trial_date: null,
                measurements: buildMeasurements(store.dictionary, row.garment),
                special_instructions: null,
                notes: null,
                files: [],
                created_by: UPLOADED_BY,
                updated_by: UPLOADED_BY,
                created_at: nowIso(),
                updated_at: nowIso(),
              };
              pattern.versions = [version];
              pattern.final_version_id = version.id;
            }

            const before = countFilled(version.measurements);
            let merged;
            if (before === 0 && (version.measurements || []).length === 0) {
              merged = pointsToMeasurements(parsed.points);
            } else if (before === 0) {
              // Empty template: prefer xlsx-shaped rows when dictionary match is weak
              const trialMerge = mergeMeasurementsFillEmpty(version.measurements, parsed.points);
              const afterMerge = countFilled(trialMerge);
              merged =
                afterMerge >= MIN_FILLED_OK
                  ? trialMerge
                  : pointsToMeasurements(parsed.points);
            } else {
              merged = mergeMeasurementsFillEmpty(version.measurements, parsed.points);
            }
            const after = countFilled(merged);
            if (after <= before) {
              actions.skipped.push({
                label,
                reason: `no new measurement cells (before=${before} after=${after})`,
              });
              console.log(`SKIP meas ${label}: no new cells`);
            } else {
              const vIdx = pattern.versions.findIndex((v) => v.id === version.id);
              pattern.versions[vIdx] = {
                ...version,
                measurements: merged,
                special_instructions:
                  parsed.special_instructions || version.special_instructions,
                notes: [
                  version.notes,
                  `Filled empty cells from ${xName} (Mahrab gap fill)`,
                ]
                  .filter(Boolean)
                  .join(" | "),
                updated_by: UPLOADED_BY,
                updated_at: nowIso(),
              };
              if (parsed.unit) pattern.unit = parsed.unit;
              if (parsed.pattern_ref && (!pattern.pattern_ref || /CUSTOM/i.test(pattern.pattern_ref))) {
                pattern.pattern_ref = parsed.pattern_ref.trim();
              }
              if (parsed.fabric_code && !pattern.fabric) pattern.fabric = parsed.fabric_code;
              pattern.updated_at = nowIso();
              actions.measurements_filled.push({
                label,
                pattern_id: pattern.id,
                source: xName,
                before,
                after,
                filled_delta: after - before,
              });
              dirtyLibrary = true;
              console.log(
                `MEAS OK (${i + 1}/${work.length}) ${label} filled ${before}->${after} from ${xName}`
              );
              await notify("client_pattern.updated", {
                id: pattern.id,
                pattern_ref: pattern.pattern_ref,
                updated_by: UPLOADED_BY,
                filled_measurements: after,
              });
            }
          }
        }

        // Link obvious jobs: same client + garment, unlinked
        const gKeys = garmentKeys(row.garment);
        const candidates = (jobsDoc.jobs || []).filter((j) => {
          if (j.client_id !== row.client_id) return false;
          if (String(j.status || "").toLowerCase() === "cancelled") return false;
          if (j.client_pattern_id) return false;
          const jk = jobGarmentKeys(j.garment_type);
          return [...gKeys].some((k) => jk.has(k));
        });
        if (candidates.length === 1) {
          const job = candidates[0];
          const version = latestVersion(pattern);
          job.client_pattern_id = pattern.id;
          if (version) job.client_pattern_version_id = version.id;
          job.updated_at = nowIso();
          dirtyJobs = true;
          actions.jobs_linked.push({
            job_id: job.id,
            so_number: job.so_number,
            pattern_id: pattern.id,
            label,
          });
          console.log(`JOB link ${job.so_number || job.id} -> ${pattern.id}`);
          await notify("pattern_job.updated", {
            id: job.id,
            sales_order_id: job.sales_order_id,
            so_number: job.so_number,
            status: job.status,
            client_pattern_id: pattern.id,
            updated_by: UPLOADED_BY,
          });
        }

        // Write back pattern into store
        const pIdx = store.client_patterns.findIndex((p) => p.id === pattern.id);
        if (pIdx >= 0) store.client_patterns[pIdx] = pattern;

        if (actions.tud_uploaded.length + actions.measurements_filled.length > 0 &&
            (actions.tud_uploaded.length + actions.measurements_filled.length) % 5 === 0) {
          await persistLibrary();
          if (dirtyJobs) await persistJobs();
        }
      } catch (err) {
        actions.failed.push({ label, error: String(err.message || err) });
        console.error(`FAIL ${label}:`, err.message || err);
      }
    }

    if (dirtyLibrary) await persistLibrary();
    if (dirtyJobs) await persistJobs();
    console.log("Persisted pattern_library (+ jobs if linked) to Supabase.");
  } else {
    console.log("\n(dry-run -- no uploads/fills)");
  }

  // Reclassify remaining gaps after apply (from in-memory store)
  const remaining = [];
  for (const row of rows) {
    const patterns = findPatternsForClientGarment(store, row.client_id, row.garment);
    const pattern = pickPrimaryPattern(patterns, row.garment);
    const version = pattern ? latestVersion(pattern) : null;
    const filled = version ? countFilled(version.measurements) : 0;
    const libHasTud = pattern ? hasTud(pattern) : false;
    const stillNeedTud = row.HAS_TUD_IN_SOURCE && !libHasTud;
    const stillNeedMeas = row.HAS_XLSX_IN_SOURCE && filled < MIN_FILLED_OK;
    if (stillNeedTud || stillNeedMeas || !pattern) {
      remaining.push({
        ...row,
        pattern_id: pattern?.id || row.pattern_id,
        HAS_TUD_IN_LIBRARY: libHasTud,
        HAS_MEASUREMENTS_FILLED: filled >= MIN_FILLED_OK,
        filled_count: filled,
        still_need_tud: stillNeedTud,
        still_need_measurements: stillNeedMeas,
        remaining_reason: [
          !pattern ? "no pattern" : null,
          stillNeedTud ? "missing tud" : null,
          stillNeedMeas ? "sparse/empty measurements" : null,
        ]
          .filter(Boolean)
          .join("; "),
      });
    }
  }

  const report = {
    generated_at: nowIso(),
    root: ROOT,
    mode: dryRun ? "dry-run" : "apply",
    summary: {
      ...summary,
      tud_uploaded_this_run: actions.tud_uploaded.length,
      measurements_filled_this_run: actions.measurements_filled.length,
      patterns_created_this_run: actions.patterns_created.length,
      jobs_linked_this_run: actions.jobs_linked.length,
      failed_this_run: actions.failed.length,
      remaining_gaps: remaining.length,
    },
    matched_folders: matchedFolders,
    unmatched_folders: unmatchedFolders,
    skipped_reference: skippedReference,
    skipped_junk: skippedJunk,
    rows,
    actions,
    remaining_gaps: remaining,
  };

  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(RUN_LOG, JSON.stringify(report, null, 2) + "\n");
  const pdfOk = renderPdf(report);

  console.log("\n=== DONE ===");
  console.log(`  clients scanned: ${summary.scanned_client_folders}`);
  console.log(`  matched: ${summary.matched_client_folders}`);
  console.log(`  garment rows: ${summary.garment_rows}`);
  console.log(`  already OK: ${summary.already_ok}`);
  console.log(`  TUD uploaded this run: ${actions.tud_uploaded.length}`);
  console.log(`  measurements filled this run: ${actions.measurements_filled.length}`);
  console.log(`  patterns created: ${actions.patterns_created.length}`);
  console.log(`  jobs linked: ${actions.jobs_linked.length}`);
  console.log(`  failed: ${actions.failed.length}`);
  console.log(`  remaining gaps: ${remaining.length}`);
  console.log(`  JSON: ${REPORT_JSON}`);
  console.log(`  PDF: ${pdfOk ? REPORT_PDF : "(not written)"}`);
  console.log(`  log: ${RUN_LOG}`);

  if (remaining.length) {
    console.log("\nRemaining gap highlights:");
    for (const r of remaining.slice(0, 40)) {
      console.log(
        `  - ${r.client_code} ${r.folder}/${r.garment}: ${r.remaining_reason}` +
          (r.source_xlsx && r.still_need_measurements ? ` [xlsx=${basename(r.source_xlsx)}]` : "") +
          (r.source_tud && r.still_need_tud ? ` [tud=${basename(r.source_tud)}]` : "")
      );
    }
    if (remaining.length > 40) console.log(`  ... ${remaining.length - 40} more`);
  }
  if (actions.failed.length) {
    console.log("\nFailures:");
    for (const f of actions.failed) console.log(`  - ${f.label}: ${f.error}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
