#!/usr/bin/env node
/**
 * Restore Patrick Raupach (GL-0326-0003 / SO-2026-0103).
 * The SO was trimmed to 5 fabric lines after pattern jobs were synced for 15 garments.
 * Reconstructs fabric lines from active pattern jobs (source of truth for this order).
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SO_ID = "so-1780844985084";
const SO_NUMBER = "SO-2026-0103";
const force = process.argv.includes("--force");

const PIECE_ABBREV = {
  Jacket: "JKT",
  Trouser: "TR",
  "Shirt LS": "SHT-LS",
  Overshirt: "OS",
  Suit: "SUIT",
};

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

function mapSupplier(name) {
  if (!name) return { id: "unknown", name: "Unknown" };
  const normalized = name.trim().toLowerCase();
  const map = {
    canclini: { id: "canclini", name: "Canclini" },
    stylbiella: { id: "stylbiella", name: "Stylbiella" },
    "wool stock": { id: "gliani-stock", name: "Gliani Stock" },
    "gliani stock": { id: "gliani-stock", name: "Gliani Stock" },
  };
  return map[normalized] ?? { id: normalized.replace(/\s+/g, "-"), name: name.trim() };
}

/** Match src/lib/sales-orders/label-codes.ts — Suit gets JKT + TR, not piece_name alone. */
function generateFabricLabelStickers(clientReference, lineIndex, garmentType, pieceName) {
  const linePart = `L${String(lineIndex).padStart(2, "0")}`;
  const pieces =
    garmentType === "Suit"
      ? ["Jacket", "Trouser"]
      : [pieceName.split("(")[0].trim() || garmentType];
  return pieces.map((piece, index) => {
    const abbrev =
      PIECE_ABBREV[piece] ??
      piece.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
    return {
      code: `${clientReference}-${linePart}-${abbrev}`,
      piece_name: piece,
      sequence: index + 1,
    };
  });
}

function fabricLineFromJob(job, clientReference, articleNumber, existingLine) {
  const supplier = mapSupplier(job.supplier);
  const label_stickers = generateFabricLabelStickers(
    clientReference,
    articleNumber,
    job.garment_type,
    job.piece_name
  );
  return {
    ...(existingLine ?? {}),
    id: job.sales_order_line_id,
    garment_type: job.garment_type,
    label_count: label_stickers.length,
    label_stickers,
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    fabric_number: job.fabric_number,
    quantity: job.meters ?? existingLine?.quantity ?? 1,
    unit: "meters",
    unit_price: existingLine?.unit_price ?? 0,
    composition: job.composition ?? existingLine?.composition ?? null,
    weight_gsm: job.gsm ?? existingLine?.weight_gsm ?? null,
    width_cm: job.width_cm ?? existingLine?.width_cm ?? null,
    width_inches: job.width_inches ?? existingLine?.width_inches ?? null,
    color: job.color ?? existingLine?.color ?? null,
    needs_replacement: existingLine?.needs_replacement ?? false,
    replacement_fabric_number: existingLine?.replacement_fabric_number ?? null,
  };
}

async function fetchDoc(admin, id) {
  const { data, error } = await admin.from("erp_documents").select("data").eq("id", id).single();
  if (error) throw new Error(`Fetch ${id}: ${error.message}`);
  return data.data;
}

async function syncDoc(admin, id, data) {
  const updated_at = new Date().toISOString();
  const payload = { ...data, updated_at: data.updated_at ?? updated_at };
  const { error } = await admin
    .from("erp_documents")
    .upsert({ id, data: payload, updated_at }, { onConflict: "id" });
  if (error) throw new Error(`Supabase upsert ${id} failed: ${error.message}`);
  return payload;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) throw new Error("Missing Supabase credentials");

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const soStore = await fetchDoc(admin, "sales_orders");
  const pjStore = await fetchDoc(admin, "pattern_jobs");

  const orderIndex = soStore.orders.findIndex((o) => o.id === SO_ID || o.so_number === SO_NUMBER);
  if (orderIndex < 0) throw new Error(`${SO_NUMBER} not found`);

  const order = soStore.orders[orderIndex];
  const clientReference = order.client_reference ?? `${order.client_code}-${SO_NUMBER}`;
  const existingByLineId = new Map(order.fabric_lines.map((line) => [line.id, line]));

  const activeJobs = pjStore.jobs
    .filter((job) => job.sales_order_id === SO_ID && job.status !== "cancelled")
    .sort((a, b) => a.article_number - b.article_number);

  if (activeJobs.length === 0) throw new Error("No active pattern jobs found for this order");

  const jobLineIds = new Set(activeJobs.map((job) => job.sales_order_line_id));
  const removedLines = order.fabric_lines.filter((line) => !jobLineIds.has(line.id));

  const fabric_lines = activeJobs.map((job) =>
    fabricLineFromJob(
      job,
      clientReference,
      job.article_number,
      existingByLineId.get(job.sales_order_line_id)
    )
  );

  const restoredOrder = { ...order, fabric_lines };
  soStore.orders[orderIndex] = restoredOrder;

  if (removedLines.length > 0 && !force) {
    throw new Error(
      `Would remove ${removedLines.length} fabric line(s) not linked to pattern jobs: ${removedLines.map((l) => l.id).join(", ")}. Re-run with --force to confirm.`
    );
  }

  await syncDoc(admin, "sales_orders", soStore);

  writeFileSync(resolve("src/data/sales-orders.json"), `${JSON.stringify(soStore, null, 2)}\n`);

  const breakdown = {};
  for (const line of fabric_lines) {
    breakdown[line.garment_type] = (breakdown[line.garment_type] || 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        client: order.client_name,
        client_code: order.client_code,
        so_id: SO_ID,
        so_number: SO_NUMBER,
        so_fabric_lines_before: order.fabric_lines.length,
        so_fabric_lines_after: fabric_lines.length,
        pattern_jobs: activeJobs.length,
        removed_orphan_lines: removedLines.map((l) => ({
          id: l.id,
          garment: l.garment_type,
          fabric: l.fabric_number,
        })),
        garment_breakdown: breakdown,
        fabric_lines: fabric_lines.map((l, i) => ({
          article: i + 1,
          id: l.id,
          garment: l.garment_type,
          fabric: l.fabric_number,
          sticker: l.label_stickers?.[0]?.code,
        })),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
