#!/usr/bin/env node
/**
 * Append Drapers fabric lines to Moussa FR-0226-0024 fabric order draft.
 * Parsed from handwritten order (IMG_8352) — paper codes S0878 / S0803 → catalog 50878 / 50803.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const DRAFT_FILE = resolve(process.cwd(), "fabric-order-drafts.local.json");
const DOCUMENT_ID = "fabric_order_drafts";
const CLIENT_ID = "cu-abdullah-al-moussa-fouad-rahme";
const USER = "info@hagan.pro";
const SUPPLIER_ID = "drapers";
const SUPPLIER_NAME = "Drapers";
const STAMP = Date.now();

const catalog = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/data/suppliers/drapers-hs-ss26.json"), "utf8")
);

const catalogByNumber = new Map(catalog.fabrics.map((f) => [f.fabric_number, f]));

function fabricFromCatalog(fabricNumber) {
  const f = catalogByNumber.get(fabricNumber);
  if (!f) return null;
  return {
    id: `drp-${f.fabric_number}`,
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

/** Handwritten Drapers order — S-prefix on paper maps to 5-digit catalog numbers. */
const DRAPERS_LINES = [
  {
    fabric_number: "50878",
    garment_type: "Jacket",
    meters: "",
    note: "Half or no lining — set with Solbiati S05007 trouser",
  },
  {
    fabric_number: "50803",
    garment_type: "Jacket",
    meters: "",
    note: "Half or no lining — set with Solbiati S05006 trouser",
  },
];

const DRAPERS_NOTES = [
  "Handwritten order (Drapers / DP):",
  "50878 (paper S0878): Jacket — half or no lining. Set with Solbiati S05007 trouser.",
  "50803 (paper S0803): Jacket — half or no lining. Set with Solbiati S05006 trouser.",
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
  const base = fabricFromCatalog(spec.fabric_number);
  if (!base) {
    throw new Error(`Fabric ${spec.fabric_number} not found in Drapers catalog`);
  }
  return {
    ...base,
    lineId: `line-${STAMP}-${existingCount + index}-cu-abdullah-al-moussa-fouad-rahme-${spec.fabric_number}`,
    garment_type: spec.garment_type,
    label_count: 1,
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
  const toAdd = DRAPERS_LINES.filter((spec) => !existingNumbers.has(spec.fabric_number));

  if (toAdd.length === 0) {
    console.log("All Drapers lines already present — nothing to add");
  } else {
    const startIndex = clientDraft.lines.length;
    const newLines = toAdd.map((spec, i) => buildLine(spec, i, startIndex));
    clientDraft.lines.push(...newLines);

    const existingNotes = clientDraft.notes?.trim() ?? "";
    if (!existingNotes.includes("Drapers / DP")) {
      clientDraft.notes = existingNotes
        ? `${existingNotes}\n\n${DRAPERS_NOTES}`
        : DRAPERS_NOTES;
    }

    const now = new Date().toISOString();
    draftFile.updated_at = now;
    userDraft.saved_at = now;
    userDraft.draft.savedAt = now;
    userDraft.draft.selectedFabricBrandId = "drapers";

    writeFileSync(DRAFT_FILE, `${JSON.stringify(draftFile, null, 2)}\n`, "utf8");
    console.log(`Added ${newLines.length} Drapers line(s)`);
    newLines.forEach((l) => console.log(`  + ${l.fabric_number} → ${l.garment_type} (${l.meters || "TBD"} m)`));
  }

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
