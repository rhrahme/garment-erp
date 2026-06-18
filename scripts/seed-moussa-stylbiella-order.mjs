#!/usr/bin/env node
/**
 * Seed Abdullah Al Moussa handwritten Stylbiella order as a real sales order (SO-2026-0107).
 * Meters left at 1 m placeholder — user should update before emailing supplier.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const SALES_ORDERS_PATH = resolve(process.cwd(), "src/data/sales-orders.json");

const GARMENT_PIECES = {
  Suit: ["Jacket", "Trouser"],
  "Overshirt+Trouser": ["Overshirt", "Trouser"],
  "Shirt+Trouser": ["Shirt", "Trouser"],
  "Shirt+Trouser+Short": ["Shirt", "Trouser", "Short"],
  "Shirt+Short": ["Shirt", "Short"],
  "Fabric only": [],
};

const PIECE_ABBREV = {
  Jacket: "JKT",
  Trouser: "TR",
  Shirt: "SHT",
  "Shirt LS": "SHT-LS",
  "Shirt SS": "SHT-SS",
  Overshirt: "OS",
  Short: "SH",
  Overcoat: "OC",
};

function getGarmentPieces(garmentType) {
  if (GARMENT_PIECES[garmentType]) return GARMENT_PIECES[garmentType];
  return [garmentType];
}

function pieceAbbrev(pieceName) {
  return PIECE_ABBREV[pieceName] ?? pieceName.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
}

function generateFabricLabelStickers(clientReference, lineIndex, garmentType) {
  const pieces = getGarmentPieces(garmentType);
  const linePart = `L${String(lineIndex).padStart(2, "0")}`;
  return pieces.map((piece_name, index) => ({
    code: `${clientReference}-${linePart}-${pieceAbbrev(piece_name)}`,
    piece_name,
    sequence: index + 1,
  }));
}

const FABRIC_LINES = [
  {
    id: "line-moussa-stylbiella-0",
    fabric_number: "43529/657",
    garment_type: "Overshirt+Trouser",
    composition: "100% LINEN",
    weight_gsm: 250,
    width_cm: 130,
    unit_price: 58.7,
  },
  {
    id: "line-moussa-stylbiella-1",
    fabric_number: "43525/657",
    garment_type: "Overshirt+Trouser",
    composition: "100% LINEN",
    weight_gsm: 250,
    width_cm: 130,
    unit_price: 58.7,
  },
  {
    id: "line-moussa-stylbiella-2",
    fabric_number: "43524/657",
    garment_type: "Overshirt+Trouser",
    composition: "100% LINEN",
    weight_gsm: 250,
    width_cm: 130,
    unit_price: 58.7,
  },
  {
    id: "line-moussa-stylbiella-3",
    fabric_number: "43528/657",
    garment_type: "Overshirt+Trouser",
    composition: "100% LINEN",
    weight_gsm: 250,
    width_cm: 130,
    unit_price: 58.7,
  },
  {
    id: "line-moussa-stylbiella-4",
    fabric_number: "43527/657",
    garment_type: "Overshirt+Trouser",
    composition: "100% LINEN",
    weight_gsm: 250,
    width_cm: 130,
    unit_price: 58.7,
  },
  {
    id: "line-moussa-stylbiella-5",
    fabric_number: "43416/619",
    garment_type: "Trouser",
    composition: "96% WOOL 4% ELASTANE",
    weight_gsm: 270,
    width_cm: 150,
    unit_price: 45.3,
  },
  {
    id: "line-moussa-stylbiella-6",
    fabric_number: "43401/619",
    garment_type: "Trouser",
    composition: "96% WOOL 4% ELASTANE",
    weight_gsm: 270,
    width_cm: 150,
    unit_price: 45.3,
  },
  {
    id: "line-moussa-stylbiella-7",
    fabric_number: "43233/160",
    garment_type: "Fabric only",
    composition: null,
    weight_gsm: null,
    width_cm: null,
    unit_price: 0,
  },
  {
    id: "line-moussa-stylbiella-8",
    fabric_number: "71493/052",
    garment_type: "Jacket",
    composition: "100/1,120/1-100% COTTON",
    weight_gsm: 135,
    width_cm: 150,
    unit_price: 30,
  },
];

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

function buildOrder(soNumber, clientReference) {
  const now = new Date().toISOString();
  const fabric_lines = FABRIC_LINES.map((line, index) => {
    const label_stickers = generateFabricLabelStickers(clientReference, index + 1, line.garment_type);
    return {
      id: line.id,
      unit: "meters",
      color: null,
      quantity: 1,
      width_cm: line.width_cm,
      unit_price: line.unit_price,
      weight_gsm: line.weight_gsm,
      composition: line.composition,
      label_count: label_stickers.length,
      supplier_id: "stylbiella",
      garment_type: line.garment_type,
      width_inches: null,
      fabric_number: line.fabric_number,
      supplier_name: "Stylbiella",
      label_stickers,
      added_at: now,
      added_by: "info@hagan.pro",
      a4_printed_at: null,
      prep_stickers_printed_at: null,
      prod_stickers_printed_at: null,
      needs_replacement: false,
      replacement_fabric_number: null,
      stock_status: null,
      restock_date: null,
    };
  });

  return {
    id: "so-moussa-stylbiella-handwritten",
    notes:
      "Handwritten order (S.B = Stylbiella) — meters TBD on all lines.\n43401/619: suggest cotton shirt light beige.\n43233/160: fabric only on paper (catalog has 43233/638, not /160).\n71493/052: Thobe + Jacket on paper — entered as Jacket.",
    status: "open",
    client_id: "cu-abdullah-al-moussa-fouad-rahme",
    so_number: soNumber,
    order_date: new Date().toISOString().slice(0, 10),
    client_code: "FR-0226-0024",
    client_name: "Abdullah Al Moussa",
    client_reference: clientReference,
    delivery_date: null,
    delivery_destination: null,
    fabric_lines,
    fabric_po_ids: [],
  };
}

async function syncSalesOrdersToSupabase(payload) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !serviceKey) {
    console.warn("Skipping Supabase sync — no credentials in .env.local");
    return false;
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.from("erp_documents").upsert(
    { id: "sales_orders", data: payload, updated_at: payload.updated_at },
    { onConflict: "id" }
  );

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }
  return true;
}

async function main() {
  const store = JSON.parse(readFileSync(SALES_ORDERS_PATH, "utf8"));
  const existing = store.orders.find((o) => o.id === "so-moussa-stylbiella-handwritten");
  if (existing) {
    console.log(`Order already exists: ${existing.so_number}`);
    return;
  }

  const year = new Date().getFullYear();
  const prefix = `SO-${year}-`;
  let max = 0;
  for (const order of store.orders) {
    if (!order.so_number.startsWith(prefix)) continue;
    const seq = Number.parseInt(order.so_number.slice(prefix.length), 10);
    if (!Number.isNaN(seq) && seq > max) max = seq;
  }
  const soNumber = `${prefix}${String(max + 1).padStart(4, "0")}`;
  const clientReference = `FR-0226-0024-${soNumber}`;
  const order = buildOrder(soNumber, clientReference);

  store.orders.unshift(order);
  store.updated_at = new Date().toISOString();

  writeFileSync(SALES_ORDERS_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  console.log(`Created sales order ${soNumber} (${order.id}) with ${order.fabric_lines.length} lines`);

  const synced = await syncSalesOrdersToSupabase(store);
  console.log(synced ? "Synced sales_orders to Supabase" : "Local file only (no Supabase sync)");

  console.log("\nLines:");
  for (const line of order.fabric_lines) {
    console.log(
      `  ${line.fabric_number} → ${line.garment_type} (${line.label_count} label${line.label_count === 1 ? "" : "s"})`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
