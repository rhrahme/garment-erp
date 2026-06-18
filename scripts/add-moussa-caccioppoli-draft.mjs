#!/usr/bin/env node
/**
 * Append Caccioppoli fabric lines to Moussa FR-0226-0024 fabric order draft.
 * Skips GLC .323 and GLC .143 shirt lines per handwritten order.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const DRAFT_FILE = resolve(process.cwd(), "fabric-order-drafts.local.json");
const DOCUMENT_ID = "fabric_order_drafts";
const CLIENT_ID = "cu-abdullah-al-moussa-fouad-rahme";
const USER = "info@hagan.pro";
const SUPPLIER_ID = "caccioppoli";
const SUPPLIER_NAME = "Caccioppoli";
const STAMP = Date.now();

const jackets = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/data/suppliers/caccioppoli-jackets-ss26.json"), "utf8")
);
const shirting = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/data/suppliers/caccioppoli-shirting-ss26.json"), "utf8")
);

const catalogByNumber = new Map();
for (const f of [...jackets.fabrics, ...shirting.fabrics]) {
  catalogByNumber.set(f.fabric_number, f);
}

function prefixFor(fabricNumber) {
  const row = catalogByNumber.get(fabricNumber);
  if (!row) return null;
  return row.category === "shirting" ? "cac-s" : "cac-j";
}

function fabricFromCatalog(fabricNumber) {
  const f = catalogByNumber.get(fabricNumber);
  if (!f) return null;
  const prefix = prefixFor(fabricNumber);
  return {
    id: `${prefix}-${f.fabric_number}`,
    supplier_id: SUPPLIER_ID,
    supplier_name: SUPPLIER_NAME,
    fabric_number: f.fabric_number,
    composition: f.composition ?? null,
    color: f.color ?? null,
    weight_gsm: f.weight_gsm ?? null,
    width_cm: f.width_cm ?? null,
    width_inches: null,
    unit_price: f.unit_price ?? null,
    unit: f.unit ?? "meters",
    stock_status: f.stock_status ?? null,
    restock_date: f.restock_date ?? null,
    manual: false,
    mill_line: null,
  };
}

function manualFabric(fabricNumber) {
  return {
    id: `manual-caccioppoli-${fabricNumber}`,
    supplier_id: SUPPLIER_ID,
    supplier_name: SUPPLIER_NAME,
    fabric_number: fabricNumber,
    composition: null,
    color: null,
    weight_gsm: null,
    width_cm: null,
    width_inches: null,
    unit_price: null,
    unit: "meters",
    stock_status: null,
    restock_date: null,
    manual: true,
    mill_line: null,
  };
}

/** Lines from handwritten Cacciop order — GLC shirt lines excluded. */
const CACCIOPPOLI_LINES = [
  { fabric_number: "360215", garment_type: "Shirt+Trouser", meters: "", note: "2 pockets up & side open" },
  { fabric_number: "360244", garment_type: "Fabric only", meters: "4" },
  { fabric_number: "360107", garment_type: "Jacket", meters: "2.3" },
  { fabric_number: "320312", garment_type: "Trouser", meters: "1.7" },
  { fabric_number: "360112", garment_type: "Jacket", meters: "2.3" },
  { fabric_number: "350333", garment_type: "Trouser", meters: "1.7", manual: true },
  { fabric_number: "206103", garment_type: "Shirt LS", meters: "2.2" },
  { fabric_number: "206155", garment_type: "House Thobe", meters: "3.5" },
  { fabric_number: "206156", garment_type: "House Thobe", meters: "3.5" },
  {
    fabric_number: "206225",
    garment_type: "Shirt+Trouser",
    meters: "",
    note: "Doctor, very long biceps, side shirt opening, upper pocket",
  },
];

const LABEL_COUNTS = {
  "Shirt+Trouser": 2,
  "Fabric only": 0,
  Jacket: 1,
  Trouser: 1,
  "Shirt LS": 1,
  "House Thobe": 1,
};

const SKIPPED_GLC = ["GLC .323", "GLC .143"];

const CACCIOPPOLI_NOTES = [
  "Handwritten order (Cacciop = Caccioppoli) — skipped GLC .323 and GLC .143 shirt lines.",
  "360215: Shirt+Trouser — 2 pockets up & side open (meters TBD).",
  "206225: Shirt+Trouser — Doctor, very long biceps, side shirt opening, upper pocket (meters TBD).",
  "350333: trouser fabric not in catalog (manual entry).",
].join("\n");

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
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

function buildLine(spec, index, existingCount) {
  const base = spec.manual ? manualFabric(spec.fabric_number) : fabricFromCatalog(spec.fabric_number);
  if (!base) {
    throw new Error(`Fabric ${spec.fabric_number} not found in Caccioppoli catalog`);
  }
  const label_count = LABEL_COUNTS[spec.garment_type] ?? 1;
  return {
    ...base,
    lineId: `line-${STAMP}-${existingCount + index}-cu-abdullah-al-moussa-fouad-rahme-${spec.fabric_number}`,
    garment_type: spec.garment_type,
    label_count,
    meters: spec.meters,
  };
}

async function upsertDocument(admin, id, data) {
  const updated_at = new Date().toISOString();
  const payload = { ...data, updated_at };
  const { error } = await admin.from("erp_documents").upsert(
    { id, data: payload, updated_at },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Supabase upsert ${id} failed: ${error.message}`);
}

async function main() {
  const draftFile = JSON.parse(readFileSync(DRAFT_FILE, "utf8"));
  const userDraft = draftFile.drafts?.[USER];
  if (!userDraft?.draft?.clientDrafts) {
    throw new Error(`No draft found for ${USER}`);
  }

  const clientDraft = userDraft.draft.clientDrafts.find((cd) => cd.clientId === CLIENT_ID);
  if (!clientDraft) {
    throw new Error(`No client draft for ${CLIENT_ID}`);
  }

  const existingNumbers = new Set(clientDraft.lines.map((l) => l.fabric_number));
  const toAdd = CACCIOPPOLI_LINES.filter((spec) => !existingNumbers.has(spec.fabric_number));

  if (toAdd.length === 0) {
    console.log("All Caccioppoli lines already present — nothing to add");
  } else {
    const startIndex = clientDraft.lines.length;
    const newLines = toAdd.map((spec, i) => buildLine(spec, i, startIndex));
    clientDraft.lines.push(...newLines);

    const existingNotes = clientDraft.notes?.trim() ?? "";
    if (!existingNotes.includes("Cacciop = Caccioppoli")) {
      clientDraft.notes = existingNotes
        ? `${existingNotes}\n\n${CACCIOPPOLI_NOTES}`
        : CACCIOPPOLI_NOTES;
    }

    const now = new Date().toISOString();
    draftFile.updated_at = now;
    userDraft.saved_at = now;
    userDraft.draft.savedAt = now;
    userDraft.draft.selectedFabricBrandId = SUPPLIER_ID;

    writeFileSync(DRAFT_FILE, `${JSON.stringify(draftFile, null, 2)}\n`, "utf8");
    console.log(`Added ${newLines.length} Caccioppoli line(s)`);
    newLines.forEach((l) => console.log(`  + ${l.fabric_number} → ${l.garment_type} (${l.meters || "TBD"} m)`));
  }

  console.log(`Skipped GLC lines: ${SKIPPED_GLC.join(", ")}`);
  console.log(`Total lines on draft: ${clientDraft.lines.length}`);

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !serviceKey) {
    console.warn("Skipping Supabase sync — no credentials in .env.local");
    return;
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: remoteRow } = await admin
    .from("erp_documents")
    .select("data")
    .eq("id", DOCUMENT_ID)
    .maybeSingle();

  const mergedDrafts = {
    updated_at: new Date().toISOString(),
    drafts: { ...(remoteRow?.data?.drafts ?? {}), ...(draftFile.drafts ?? {}) },
  };
  mergedDrafts.drafts[USER] = draftFile.drafts[USER];

  await upsertDocument(admin, DOCUMENT_ID, mergedDrafts);
  console.log("Synced fabric_order_drafts to Supabase");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
