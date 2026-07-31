/**
 * Link Mahrab client fabric reports into Pattern Library:
 *  - write linked_fabric_refs on each garment pattern (catalog codes + specs)
 *  - also assign SO fabric lines when the same fabric number exists for the client
 *  - attach the per-client PDF report to one pattern (idempotent by filename)
 *  - upsert pattern_library to production Supabase
 *
 * Usage:
 *   node scripts/link-mahrab-pattern-fabrics.mjs
 *   node scripts/link-mahrab-pattern-fabrics.mjs --dry-run
 *   node scripts/link-mahrab-pattern-fabrics.mjs --skip-pdf
 *   node scripts/link-mahrab-pattern-fabrics.mjs --limit 5
 *   node scripts/link-mahrab-pattern-fabrics.mjs --codes FR-0126-0019,FR-0226-0020
 *
 * Expects fabrics-link.json from:
 *   python3 scripts/generate-mahrab-client-fabric-reports.py --html-only
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const REPORTS_DIR = "/Users/ralphrahme/Downloads/Mahrab-pattern-reports";
const LINK_JSON = resolve(REPORTS_DIR, "fabrics-link.json");
const LIBRARY_PATH = resolve("src/data/pattern-library.json");
const CLIENTS_PATH = resolve("src/data/clients.json");
const ORDERS_PATH = resolve("src/data/sales-orders.json");
const BUCKET = "erp-pattern-files";
const UPLOADED_BY = "info@hagan.pro";
const SOURCE = "mahrab-pattern";

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

function parseArgs(argv) {
  const out = { dryRun: false, skipPdf: false, limit: 0, codes: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--skip-pdf") out.skipPdf = true;
    else if (a === "--limit") out.limit = Number(argv[++i] || 0);
    else if (a === "--codes") {
      out.codes = new Set(
        String(argv[++i] || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
    } else if (a === "--reports") {
      // unused alias reserved
    }
  }
  return out;
}

/** Normalize fabric numbers for SO matching (N781050 <-> 781050, NS14019 <-> S14019). */
function fabricMatchKeys(raw) {
  const upper = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!upper) return [];
  const keys = new Set([upper]);
  if (upper.startsWith("NS") && /^\d+$/.test(upper.slice(2))) {
    keys.add("S" + upper.slice(2));
    keys.add(upper.slice(2));
  }
  if (upper.startsWith("N") && /^\d+$/.test(upper.slice(1))) {
    keys.add(upper.slice(1));
  }
  if (upper.startsWith("S") && /^\d+$/.test(upper.slice(1))) {
    keys.add(upper.slice(1));
    keys.add("NS" + upper.slice(1));
  }
  if (/^\d{5}-\d{2,3}$/.test(upper)) {
    const [left, right] = upper.split("-");
    keys.add(left);
    keys.add(`${left}/${right}`);
  }
  if (/^\d{5}\/\d{2,4}$/.test(upper)) {
    keys.add(upper.split("/")[0]);
    keys.add(upper.replace("/", "-"));
  }
  if (/^\d{5,6}$/.test(upper)) {
    keys.add("N" + upper);
    keys.add("S" + upper);
  }
  return [...keys];
}

function clientFullName(c) {
  return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ").trim();
}

function patternRef(garment, fabric) {
  const g = String(garment || "custom").toUpperCase().replace(/\s+/g, "-");
  const f = fabric ? String(fabric).toUpperCase().replace(/[^A-Z0-9]+/g, "-") : "MULTI";
  return `${g}-${f}`.slice(0, 48);
}

function toRef(fabric) {
  return {
    fabric_number: String(fabric.fabric_number || fabric.raw || "").trim(),
    supplier_id: fabric.supplier_id || null,
    supplier_name: fabric.supplier_name || null,
    composition: fabric.composition ?? null,
    weight_gsm:
      fabric.weight_gsm != null && fabric.weight_gsm !== ""
        ? Number(fabric.weight_gsm) || null
        : null,
    width_cm:
      fabric.width_cm != null && fabric.width_cm !== "" ? Number(fabric.width_cm) || null : null,
    color: fabric.color ?? null,
    description: fabric.description ?? null,
    source: SOURCE,
  };
}

function mergeRefs(existing, incoming) {
  const byKey = new Map();
  for (const ref of existing || []) {
    const num = String(ref.fabric_number || "").trim();
    if (!num) continue;
    byKey.set(`${String(ref.supplier_id || "").toLowerCase()}::${num.toLowerCase()}`, ref);
  }
  let added = 0;
  for (const ref of incoming) {
    const num = String(ref.fabric_number || "").trim();
    if (!num) continue;
    const key = `${String(ref.supplier_id || "").toLowerCase()}::${num.toLowerCase()}`;
    if (!byKey.has(key)) {
      byKey.set(key, ref);
      added += 1;
    } else {
      // Prefer richer catalog snapshot when re-running.
      const prev = byKey.get(key);
      byKey.set(key, {
        ...prev,
        ...Object.fromEntries(
          Object.entries(ref).filter(([, v]) => v != null && v !== "")
        ),
        source: prev.source || ref.source || SOURCE,
      });
    }
  }
  return { refs: [...byKey.values()], added };
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

async function makePdfAttachment(admin, filePath, ownerPrefix) {
  const filename = basename(filePath);
  const buffer = readFileSync(filePath);
  if (!buffer.length) throw new Error("empty pdf");
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedFilename = `${ownerPrefix}-${Date.now()}-${sanitized}`;
  await uploadBytes(admin, storedFilename, buffer, "application/pdf");
  return {
    id: `plf-${Date.now()}-${createHash("sha1").update(storedFilename).digest("hex").slice(0, 6)}`,
    kind: "pdf",
    filename,
    stored_filename: storedFilename,
    content_type: "application/pdf",
    size_bytes: buffer.length,
    uploaded_at: nowIso(),
    uploaded_by: UPLOADED_BY,
  };
}

function ensurePattern(store, client, garment, fabricHint) {
  let pattern = store.client_patterns.find(
    (p) => p.client_id === client.id && p.garment_type === garment
  );
  if (pattern) return { pattern, created: false };

  const ts = Date.now();
  const version = {
    id: `cpv-${ts}-1`,
    version: 1,
    is_final: false,
    trial_date: null,
    measurements: [],
    special_instructions: null,
    notes: null,
    files: [],
    created_by: UPLOADED_BY,
    updated_by: UPLOADED_BY,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  pattern = {
    id: `cp-${ts}-${store.client_patterns.length + 1}`,
    pattern_ref: patternRef(garment, fabricHint),
    client_id: client.id,
    client_code: client.code,
    client_name: clientFullName(client),
    garment_type: garment,
    description: `${garment} pattern (created while linking Mahrab fabric report)`,
    base_pattern_id: null,
    base_size: null,
    house_brand_id: String(client.code || "").startsWith("GL") ? "gliani" : "fouad-rahme",
    house_brand_code: String(client.code || "").startsWith("GL") ? "GL" : "FR",
    fabric: fabricHint || null,
    linked_fabric_line_ids: [],
    linked_fabric_refs: [],
    unit: "in",
    versions: [version],
    final_version_id: null,
    special_instructions: null,
    physical_pattern_kept: false,
    physical_pattern_location: null,
    files: [],
    notes: "Stub pattern created by link-mahrab-pattern-fabrics.mjs",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  store.client_patterns.push(pattern);
  return { pattern, created: true };
}

function buildSoLineIndex(orders, clientId) {
  /** @type {Map<string, { lineId: string, garment: string }[]>} */
  const byKey = new Map();
  for (const order of orders) {
    if (order.client_id !== clientId) continue;
    for (const line of order.fabric_lines || []) {
      for (const key of fabricMatchKeys(line.fabric_number)) {
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push({
          lineId: line.id,
          garment: String(line.garment_type || "").toLowerCase(),
        });
      }
    }
  }
  return byKey;
}

function preferGarmentMatch(candidates, garment) {
  if (!candidates?.length) return [];
  const g = String(garment || "").toLowerCase();
  const exact = candidates.filter((c) => c.garment.includes(g) || g.includes(c.garment.split(/\s+/)[0]));
  return (exact.length ? exact : candidates).map((c) => c.lineId);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();

  if (!existsSync(LINK_JSON)) {
    throw new Error(
      `Missing ${LINK_JSON}. Run: python3 scripts/generate-mahrab-client-fabric-reports.py --html-only`
    );
  }

  const linkData = JSON.parse(readFileSync(LINK_JSON, "utf8"));
  const clientsDoc = JSON.parse(readFileSync(CLIENTS_PATH, "utf8"));
  const clientsByCode = new Map((clientsDoc.clients || []).map((c) => [c.code, c]));
  const ordersDoc = JSON.parse(readFileSync(ORDERS_PATH, "utf8"));
  const orders = ordersDoc.orders || [];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  // Prefer live Supabase document, fall back to local file.
  const admin = createClient(url, key, { auth: { persistSession: false } });
  let store;
  {
    const { data, error } = await admin.from("erp_documents").select("data").eq("id", "pattern_library").maybeSingle();
    if (error) throw new Error(`pattern_library fetch failed: ${error.message}`);
    store = data?.data || JSON.parse(readFileSync(LIBRARY_PATH, "utf8"));
  }

  let clients = [...(linkData.clients || [])];
  if (args.codes) clients = clients.filter((c) => args.codes.has(c.code));
  if (args.limit > 0) clients = clients.slice(0, args.limit);

  const log = {
    clients: 0,
    with_fabrics: 0,
    refs_added: 0,
    so_lines_linked: 0,
    patterns_created: 0,
    pdfs_attached: 0,
    skipped_pdf: 0,
    empty: 0,
    missing_client: [],
    details: [],
  };

  for (const entry of clients) {
    const client = clientsByCode.get(entry.code);
    if (!client) {
      log.missing_client.push(entry.code);
      console.warn(`SKIP ${entry.code}: client not in clients.json`);
      continue;
    }
    log.clients += 1;
    const fabrics = entry.fabrics || [];
    if (!fabrics.length) {
      log.empty += 1;
      // Still try PDF attach onto any existing pattern.
    } else {
      log.with_fabrics += 1;
    }

    const soIndex = buildSoLineIndex(orders, client.id);
    /** garment -> refs[] */
    const byGarment = new Map();
    for (const fabric of fabrics) {
      const garments = fabric.garments?.length ? fabric.garments : ["custom"];
      for (const garment of garments) {
        if (!byGarment.has(garment)) byGarment.set(garment, []);
        byGarment.get(garment).push(fabric);
      }
    }

    let clientRefsAdded = 0;
    let clientSoLinked = 0;
    let clientPatternsCreated = 0;
    const touchedPatternIds = [];

    for (const [garment, garmentFabrics] of byGarment) {
      const hint = garmentFabrics[0]?.fabric_number || null;
      const { pattern, created } = ensurePattern(store, client, garment, hint);
      if (created) clientPatternsCreated += 1;

      const incoming = garmentFabrics.map(toRef).filter((r) => r.fabric_number);
      const { refs, added } = mergeRefs(pattern.linked_fabric_refs, incoming);
      pattern.linked_fabric_refs = refs;
      clientRefsAdded += added;

      // Link matching SO fabric lines when present.
      const lineIds = new Set(pattern.linked_fabric_line_ids || []);
      for (const fabric of garmentFabrics) {
        const keys = fabricMatchKeys(fabric.fabric_number).concat(fabricMatchKeys(fabric.raw));
        const candidates = [];
        for (const key of keys) {
          for (const hit of soIndex.get(key) || []) candidates.push(hit);
        }
        for (const lineId of preferGarmentMatch(candidates, garment)) {
          if (!lineIds.has(lineId)) {
            lineIds.add(lineId);
            clientSoLinked += 1;
          }
        }
      }
      pattern.linked_fabric_line_ids = [...lineIds];

      // Keep a human-readable fabric summary on the pattern.
      if (refs.length) {
        const codes = refs.map((r) => r.fabric_number).slice(0, 6);
        pattern.fabric = codes.join(", ") + (refs.length > 6 ? ` +${refs.length - 6}` : "");
      }
      pattern.updated_at = nowIso();
      touchedPatternIds.push(pattern.id);
    }

    // Attach PDF to the first touched pattern (or any client pattern).
    let pdfAttached = false;
    if (!args.skipPdf && entry.pdf) {
      const pdfPath = resolve(REPORTS_DIR, entry.pdf);
      const target =
        store.client_patterns.find((p) => touchedPatternIds.includes(p.id)) ||
        store.client_patterns.find((p) => p.client_id === client.id);
      if (!target) {
        console.warn(`SKIP PDF ${entry.code}: no pattern to attach to`);
      } else if (!existsSync(pdfPath)) {
        console.warn(`SKIP PDF missing file ${pdfPath}`);
      } else if ((target.files || []).some((f) => f.filename === entry.pdf)) {
        log.skipped_pdf += 1;
      } else if (!args.dryRun) {
        const att = await makePdfAttachment(admin, pdfPath, target.id);
        target.files = [...(target.files || []), att];
        target.updated_at = nowIso();
        pdfAttached = true;
        log.pdfs_attached += 1;
      } else {
        pdfAttached = true;
        log.pdfs_attached += 1;
      }
    }

    log.refs_added += clientRefsAdded;
    log.so_lines_linked += clientSoLinked;
    log.patterns_created += clientPatternsCreated;
    log.details.push({
      code: entry.code,
      name: entry.name,
      fabrics: fabrics.length,
      refs_added: clientRefsAdded,
      so_lines_linked: clientSoLinked,
      patterns_created: clientPatternsCreated,
      pdf: pdfAttached || ((entry.pdf && log.skipped_pdf) ? "skipped-idempotent" : null),
      patterns: touchedPatternIds,
    });
    console.log(
      `OK ${entry.code} ${entry.name}: +${clientRefsAdded} refs, +${clientSoLinked} SO lines` +
        (clientPatternsCreated ? `, created ${clientPatternsCreated} patterns` : "") +
        (pdfAttached ? `, PDF attached` : "")
    );
  }

  if (!args.dryRun) {
    store.updated_at = nowIso();
    const { error } = await admin.from("erp_documents").upsert(
      { id: "pattern_library", data: store, updated_at: store.updated_at },
      { onConflict: "id" }
    );
    if (error) throw new Error(`pattern_library upsert failed: ${error.message}`);
    writeFileSync(LIBRARY_PATH, JSON.stringify(store, null, 2) + "\n");
    console.log("Upserted pattern_library to Supabase + local JSON.");
  } else {
    console.log("Dry run — no writes.");
  }

  const logPath = "/tmp/mahrab-pattern-fabric-link-log.json";
  writeFileSync(logPath, JSON.stringify(log, null, 2) + "\n");
  console.log("\nDone.");
  console.log(`  clients processed: ${log.clients}`);
  console.log(`  with fabrics: ${log.with_fabrics}  empty: ${log.empty}`);
  console.log(`  refs added: ${log.refs_added}`);
  console.log(`  SO lines linked: ${log.so_lines_linked}`);
  console.log(`  patterns created: ${log.patterns_created}`);
  console.log(`  PDFs attached: ${log.pdfs_attached}  skipped: ${log.skipped_pdf}`);
  if (log.missing_client.length) console.log(`  missing clients: ${log.missing_client.join(", ")}`);
  console.log(`  log: ${logPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
