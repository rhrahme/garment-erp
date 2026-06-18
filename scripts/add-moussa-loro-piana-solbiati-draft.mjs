#!/usr/bin/env node
/**
 * Append Loro Piana + Solbiati fabric lines to Moussa FR-0226-0024 fabric order draft.
 * Parsed from handwritten order (IMG_8351).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const DRAFT_FILE = resolve(process.cwd(), "fabric-order-drafts.local.json");
const DOCUMENT_ID = "fabric_order_drafts";
const CLIENT_ID = "cu-abdullah-al-moussa-fouad-rahme";
const USER = "info@hagan.pro";
const STAMP = Date.now();

const catalog = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/data/suppliers/loro-piana-ss26.json"), "utf8")
);

const catalogByNumber = new Map(catalog.fabrics.map((f) => [f.fabric_number, f]));

function isSolbiati(fabricNumber) {
  return /^S/i.test(fabricNumber.trim());
}

function fabricFromCatalog(fabricNumber) {
  const f = catalogByNumber.get(fabricNumber);
  if (!f) return null;
  const solbiati = isSolbiati(fabricNumber);
  return {
    id: solbiati ? `sol-${f.fabric_number}` : `lp-${f.fabric_number}`,
    supplier_id: "loro-piana",
    supplier_name: solbiati ? "Solbiati" : "Loro Piana",
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
    mill_line: solbiati ? "solbiati" : "loro_piana",
  };
}

function manualFabric(fabricNumber) {
  const solbiati = isSolbiati(fabricNumber);
  const slug = fabricNumber.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `manual-loro-piana-${slug}`,
    supplier_id: "loro-piana",
    supplier_name: solbiati ? "Solbiati" : "Loro Piana",
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
    mill_line: solbiati ? "solbiati" : "loro_piana",
  };
}

/** Handwritten Loro Piana + Solbiati order — NS→S normalized, meters comma→dot. */
const LP_SOLBIATI_LINES = [
  {
    fabric_number: "781006",
    garment_type: "Suit",
    meters: "",
    note: "Find matching Blue/Navy trouser fabric",
  },
  { fabric_number: "722001", garment_type: "Shirt LS", meters: "", note: "Wide collar" },
  { fabric_number: "722005", garment_type: "Shirt LS", meters: "", note: "Wide collar" },
  {
    fabric_number: "S25032",
    garment_type: "Shirt+Trouser",
    meters: "3.3",
    manual: true,
    note: "2 upper pockets & side open — NS25032 not in SS26 catalog",
  },
  {
    fabric_number: "S13028",
    garment_type: "Shirt+Trouser",
    meters: "3.3",
    note: "2 upper pocket + side open",
  },
  { fabric_number: "S23024", garment_type: "Vest", meters: "" },
  {
    fabric_number: "S23014",
    garment_type: "Shirt LS",
    meters: "",
    note: "Long sleeve — the linen one",
  },
  {
    fabric_number: "780037",
    garment_type: "Fabric only",
    meters: "5.5",
    note: "Thobe + Jacket on paper (only fabric)",
  },
  {
    fabric_number: "S05007",
    garment_type: "Trouser",
    meters: "",
    note: "Set with DP S0878 & find shirt",
  },
  {
    fabric_number: "S05006",
    garment_type: "Trouser",
    meters: "",
    note: "Set with DP S0803 & find shirt",
  },
  { fabric_number: "S10008", garment_type: "Shirt LS", meters: "2.2" },
  { fabric_number: "722026", garment_type: "House Thobe", meters: "" },
];

const LABEL_COUNTS = {
  Suit: 2,
  "Shirt LS": 1,
  "Shirt+Trouser": 2,
  Vest: 1,
  "Fabric only": 0,
  Trouser: 1,
  "House Thobe": 1,
};

const LP_SOLBIATI_NOTES = [
  "Handwritten order (Loro Piana + Solbiati):",
  "781006: Suit — find matching Blue/Navy trouser fabric.",
  "722001, 722005: Shirt LS — wide collar.",
  "Client note: Find cotton shirt fabric light Brown series.",
  "S25032: Shirt+Trouser — 2 upper pockets & side open — not in SS26 catalog (manual).",
  "S13028: Shirt+Trouser — 2 upper pocket + side open.",
  "S23014: Shirt LS — the linen one (long sleeve).",
  "780037: Fabric only — Thobe + Jacket on paper (only fabric).",
  "S05007: Trouser — set with DP S0878 & find shirt.",
  "S05006: Trouser — set with DP S0803 & find shirt.",
  "S10008 + 722026: same line on paper — S10008 Shirt 2.2m // 722026 House Thobe.",
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
    throw new Error(`Fabric ${spec.fabric_number} not found in Loro Piana catalog`);
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
  const toAdd = LP_SOLBIATI_LINES.filter((spec) => !existingNumbers.has(spec.fabric_number));

  const catalogMisses = LP_SOLBIATI_LINES.filter(
    (spec) => !spec.manual && !catalogByNumber.has(spec.fabric_number)
  ).map((s) => s.fabric_number);

  if (toAdd.length === 0) {
    console.log("All Loro Piana / Solbiati lines already present — nothing to add");
  } else {
    const startIndex = clientDraft.lines.length;
    const newLines = toAdd.map((spec, i) => buildLine(spec, i, startIndex));
    clientDraft.lines.push(...newLines);

    const existingNotes = clientDraft.notes?.trim() ?? "";
    if (!existingNotes.includes("Loro Piana + Solbiati")) {
      clientDraft.notes = existingNotes
        ? `${existingNotes}\n\n${LP_SOLBIATI_NOTES}`
        : LP_SOLBIATI_NOTES;
    }

    const now = new Date().toISOString();
    draftFile.updated_at = now;
    userDraft.saved_at = now;
    userDraft.draft.savedAt = now;
    userDraft.draft.selectedFabricBrandId = "loro-piana";

    writeFileSync(DRAFT_FILE, `${JSON.stringify(draftFile, null, 2)}\n`, "utf8");
    console.log(`Added ${newLines.length} Loro Piana / Solbiati line(s)`);
    newLines.forEach((l) => console.log(`  + ${l.fabric_number} → ${l.garment_type} (${l.meters || "TBD"} m)`));
  }

  if (catalogMisses.length) {
    console.log(`Catalog misses (non-manual): ${catalogMisses.join(", ")}`);
  }
  const manualOnly = LP_SOLBIATI_LINES.filter((s) => s.manual).map((s) => s.fabric_number);
  if (manualOnly.length) {
    console.log(`Manual entries: ${manualOnly.join(", ")}`);
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
