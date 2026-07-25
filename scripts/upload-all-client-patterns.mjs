/**
 * Bulk import matched client .tud (+ companion .xlsx) from
 * Downloads/Base Patterns /ALL into live pattern_library + erp-pattern-files.
 *
 * Also upserts local base_patterns / dictionary into Supabase while merging
 * remote client_patterns (never drops Ajlan cp-1784935127357-1).
 *
 * Usage:
 *   node --experimental-strip-types scripts/upload-all-client-patterns.mjs
 *   node --experimental-strip-types scripts/upload-all-client-patterns.mjs --dry-run
 *   node --experimental-strip-types scripts/upload-all-client-patterns.mjs --limit 5
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { parseTudFile } from "../src/lib/pattern-library/tud-parser.ts";

const ROOT = "/Users/ralphrahme/Downloads/Base Patterns /ALL";
const LIBRARY_PATH = resolve("src/data/pattern-library.json");
const CLIENTS_PATH = resolve("src/data/clients.json");
const BUCKET = "erp-pattern-files";
const UPLOADED_BY = "info@hagan.pro";
const PRESERVE_PATTERN_ID = "cp-1784935127357-1";

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

/** Manual ERP matches (folder → client code) beyond fuzzy inventory. */
const FORCE_MATCH = {
  "Moid Al Zahrani (Abu Mazen)": "FR-0526-0029",
  "Prince Khaled": "FR-0626-0037",
  "Abdelillah Al Sheikh": "FR-0526-0027",
  "Elie Sir": "GL-0326-0004",
  "Ajlan Mohammad Al Ajlan": "FR-0626-0035",
};

/** Folders that fuzzy-matched wrongly — leave for owner. */
const FORCE_SKIP = new Set(["Khaled Al Omair", "Sheikh Mohamad Al Ajlan"]);

const GARMENT_HINTS = [
  // Specific compound names first (path folders can otherwise steal the match).
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
  // Bare "short" last — shorts folders, after short-sleeve / shirt checks.
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

function detectGarment(...texts) {
  const t = texts.join(" ").toLowerCase();
  for (const [hint, g] of GARMENT_HINTS) {
    if (t.includes(hint)) return g;
  }
  return "custom";
}

function detectFabric(...texts) {
  const t = texts.join(" ").toLowerCase();
  if (t.includes("linen")) return "Linen";
  if (t.includes("cotton")) return "Cotton";
  if (t.includes("wool")) return "Wool";
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
    // crude ratio
    let same = 0;
    const a = fs.replace(/mohammad/g, "mohamad").replace(/abdelaziz/g, "abdel aziz");
    const b = cs.replace(/mohammad/g, "mohamad").replace(/abdelaziz/g, "abdel aziz").replace(/abdulaziz/g, "abdel aziz");
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
  // Guard obvious false friends (shared last token only)
  const last = [...ftoks].filter((t) => !drop.has(t)).pop();
  const clientLast = slug(best.last_name || "").split(" ").pop();
  if (last && clientLast && last !== clientLast && bestScore < 0.9) return null;
  return { client: best, score: bestScore, forced: false };
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

function nowIso() {
  return new Date().toISOString();
}

function buildMeasurements(dictionary, garmentType) {
  const points = dictionary.filter((p) => (p.garment_types || []).includes(garmentType));
  const source = points.length ? points : dictionary.slice(0, 0);
  return source.map((point) => ({
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

function patternRef(garment, fabric, size) {
  const bits = [garment.toUpperCase()];
  if (fabric) bits.push(fabric.toUpperCase());
  bits.push("CUSTOM");
  if (size) bits.push(String(size).toUpperCase());
  return bits.join("-");
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

function pickGarmentGroups(clientDir) {
  const files = walkFiles(clientDir).filter((f) => {
    const ext = extname(f).toLowerCase();
    return ext === ".tud" || ext === ".xlsx";
  });
  /** @type {Map<string, {tud: string[], xlsx: string[]}>} */
  const groups = new Map();
  for (const full of files) {
    const rel = relative(clientDir, full);
    const name = basename(full);
    // Prefer filename garment over parent-folder (avoids Over Shirt inside Trouser/).
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
    const rel = p;
    const kind = pathKind(rel);
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

function pickCompanionXlsx(tudPath, xlsxPaths) {
  if (!tudPath || !xlsxPaths.length) return null;
  const dir = dirname(tudPath);
  const stem = basename(tudPath, ".tud").toLowerCase().replace(/\s+/g, " ").trim();
  const sameDir = xlsxPaths.filter((p) => dirname(p) === dir);
  const pool = sameDir.length ? sameDir : xlsxPaths;
  const byStem = pool.find((p) => basename(p, ".xlsx").toLowerCase().includes(stem.slice(0, 20)));
  if (byStem) return byStem;
  const finals = pool.filter((p) => pathKind(p) === "final");
  return (finals[0] || pool.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]) ?? null;
}

async function main() {
  loadEnv();
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : Infinity;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const local = JSON.parse(readFileSync(LIBRARY_PATH, "utf8"));
  const clientsDoc = JSON.parse(readFileSync(CLIENTS_PATH, "utf8"));
  const clients = clientsDoc.clients || [];

  const { data: remoteRow, error: remoteErr } = await admin
    .from("erp_documents")
    .select("data, updated_at")
    .eq("id", "pattern_library")
    .maybeSingle();
  if (remoteErr) throw remoteErr;
  const remote = remoteRow?.data || { dictionary: [], base_patterns: [], client_patterns: [] };

  // Merge: local bases/dict win; client_patterns = union by id (remote preferred on conflict except we keep both uniquely)
  const cpsById = new Map();
  for (const cp of remote.client_patterns || []) cpsById.set(cp.id, cp);
  for (const cp of local.client_patterns || []) {
    if (!cpsById.has(cp.id)) cpsById.set(cp.id, cp);
  }
  if (!cpsById.has(PRESERVE_PATTERN_ID)) {
    const localAjlan = (local.client_patterns || []).find((c) => c.id === PRESERVE_PATTERN_ID);
    const remoteAjlan = (remote.client_patterns || []).find((c) => c.id === PRESERVE_PATTERN_ID);
    if (remoteAjlan) cpsById.set(PRESERVE_PATTERN_ID, remoteAjlan);
    else if (localAjlan) cpsById.set(PRESERVE_PATTERN_ID, localAjlan);
  }

  let store = {
    updated_at: nowIso(),
    dictionary: local.dictionary || remote.dictionary || [],
    base_patterns: local.base_patterns || [],
    client_patterns: [...cpsById.values()],
  };

  console.log(
    `Library merge: bases=${store.base_patterns.length} dict=${store.dictionary.length} cps=${store.client_patterns.length}`
  );
  console.log(`Preserved Ajlan pattern present: ${store.client_patterns.some((c) => c.id === PRESERVE_PATTERN_ID)}`);

  const top = readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.name !== ".DS_Store")
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const clientFolders = top.filter((name) => {
    const low = name.toLowerCase();
    if (SKIP_TOP.has(low) || BASE_FAMILY.has(low)) return false;
    return statSync(join(ROOT, name)).isDirectory();
  });

  const plan = [];
  for (const folder of clientFolders) {
    const match = fuzzyMatch(folder, clients);
    if (!match) continue;
    const groups = pickGarmentGroups(join(ROOT, folder));
    for (const [garment, files] of groups) {
      if (!files.tud.length) continue;
      const pick = pickBestTud(files.tud);
      const primary = pick.final || pick.other || pick.trial;
      if (!primary) continue;
      const trial = pick.final && pick.trial ? pick.trial : null;
      const xlsx = pickCompanionXlsx(primary, files.xlsx);
      plan.push({
        folder,
        client: match.client,
        score: match.score,
        garment,
        primary,
        trial,
        xlsx,
        isFinal: Boolean(pick.final) || pathKind(primary) !== "trial",
      });
    }
  }

  console.log(`Upload plan: ${plan.length} client garment patterns from ${new Set(plan.map((p) => p.folder)).size} folders`);
  const limited = plan.slice(0, Number.isFinite(limit) ? limit : plan.length);
  if (dryRun) {
    for (const row of limited.slice(0, 40)) {
      console.log(
        `  [${row.client.code}] ${row.folder} / ${row.garment} <- ${basename(row.primary)}${row.trial ? " (+trial)" : ""}${row.xlsx ? " +xlsx" : ""}`
      );
    }
    if (limited.length > 40) console.log(`  ... ${limited.length - 40} more`);
    console.log("Dry run — no writes.");
    return;
  }

  const log = { uploaded: [], skipped: [], failed: [], created_patterns: [] };
  let dirty = false;

  async function persist() {
    store.updated_at = nowIso();
    const { error } = await admin.from("erp_documents").upsert(
      { id: "pattern_library", data: store, updated_at: store.updated_at },
      { onConflict: "id" }
    );
    if (error) throw new Error(`pattern_library upsert failed: ${error.message}`);
    writeFileSync(LIBRARY_PATH, JSON.stringify(store, null, 2) + "\n");
    dirty = false;
  }

  // First persist bases/dict merge before file uploads.
  await persist();
  console.log("Upserted pattern_library bases/dictionary to Supabase.");

  for (let i = 0; i < limited.length; i++) {
    const row = limited[i];
    const label = `${row.client.code} ${row.folder}/${row.garment}`;
    try {
      let pattern = store.client_patterns.find(
        (p) => p.client_id === row.client.id && p.garment_type === row.garment
      );

      // Ajlan shorts: always reuse the known pattern id when garment is shorts
      if (
        row.client.code === "FR-0626-0035" &&
        row.garment === "shorts" &&
        store.client_patterns.some((p) => p.id === PRESERVE_PATTERN_ID)
      ) {
        pattern = store.client_patterns.find((p) => p.id === PRESERVE_PATTERN_ID);
      }

      if (!pattern) {
        const ts = Date.now();
        const version = {
          id: `cpv-${ts}-1`,
          version: 1,
          is_final: Boolean(row.isFinal),
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
        const fabric = detectFabric(row.primary, row.folder);
        pattern = {
          id: `cp-${ts}-${store.client_patterns.length + 1}`,
          pattern_ref: patternRef(row.garment, fabric, null),
          client_id: row.client.id,
          client_code: row.client.code,
          client_name: clientFullName(row.client),
          garment_type: row.garment,
          description: `${row.garment} pattern imported from Base Patterns /ALL/${row.folder}`,
          base_pattern_id: null,
          base_size: null,
          house_brand_id: String(row.client.code || "").startsWith("GL") ? "gliani" : "fouad-rahme",
          house_brand_code: String(row.client.code || "").startsWith("GL") ? "GL" : "FR",
          fabric,
          linked_fabric_line_ids: [],
          unit: "in",
          versions: [version],
          final_version_id: row.isFinal ? version.id : null,
          special_instructions: null,
          physical_pattern_kept: false,
          physical_pattern_location: null,
          files: [],
          notes: `Imported from ${relative(ROOT, row.primary)}. Prefer Final over Trial.`,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        store.client_patterns.push(pattern);
        log.created_patterns.push(pattern.id);
        dirty = true;
      }

      const already = (pattern.files || []).some((f) => f.filename === basename(row.primary));
      if (already) {
        log.skipped.push({ label, reason: "filename already attached" });
        console.log(`SKIP ${label}: already has ${basename(row.primary)}`);
        continue;
      }

      const primaryAtt = await makeAttachment(admin, row.primary, pattern.id);
      if (primaryAtt.tud?.sizes?.[0] && !pattern.base_size) {
        pattern.base_size = primaryAtt.tud.sizes[0];
      }
      pattern.files = [...(pattern.files || []), primaryAtt];

      if (row.xlsx) {
        const xName = basename(row.xlsx);
        if (!(pattern.files || []).some((f) => f.filename === xName)) {
          const xAtt = await makeAttachment(admin, row.xlsx, pattern.id);
          pattern.files.push(xAtt);
        }
      }

      if (row.trial) {
        const v = pattern.versions[0];
        if (v && !(v.files || []).some((f) => f.filename === basename(row.trial))) {
          const trialAtt = await makeAttachment(admin, row.trial, pattern.id);
          v.files = [...(v.files || []), trialAtt];
          v.notes = [v.notes, `Trial file: ${basename(row.trial)}`].filter(Boolean).join(" | ");
          v.updated_at = nowIso();
        }
      }

      pattern.updated_at = nowIso();
      const idx = store.client_patterns.findIndex((p) => p.id === pattern.id);
      store.client_patterns[idx] = pattern;
      dirty = true;
      log.uploaded.push({
        pattern_id: pattern.id,
        label,
        file: basename(row.primary),
        xlsx: row.xlsx ? basename(row.xlsx) : null,
        trial: row.trial ? basename(row.trial) : null,
      });
      console.log(`OK (${i + 1}/${limited.length}) ${label} -> ${pattern.id} / ${basename(row.primary)}`);

      // Persist every 5 uploads to limit loss on failure.
      if (log.uploaded.length % 5 === 0) await persist();
    } catch (err) {
      log.failed.push({ label, error: String(err.message || err) });
      console.error(`FAIL ${label}:`, err.message || err);
    }
  }

  if (dirty) await persist();

  const summaryPath = "/tmp/all-client-upload-log.json";
  writeFileSync(summaryPath, JSON.stringify({ ...log, plan_total: plan.length, ran: limited.length }, null, 2));
  console.log("\nDone.");
  console.log(`  created patterns: ${log.created_patterns.length}`);
  console.log(`  uploaded: ${log.uploaded.length}`);
  console.log(`  skipped: ${log.skipped.length}`);
  console.log(`  failed: ${log.failed.length}`);
  console.log(`  plan remaining after limit: ${Math.max(0, plan.length - limited.length)}`);
  console.log(`  log: ${summaryPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
