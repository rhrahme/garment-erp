#!/usr/bin/env node
/**
 * Fix SO-2026-0131: Drapers → Zegna for fabric codes 91243, 66046, 66044.
 * Merges mislabeled lines into the existing Zegna draft PO; removes duplicate Drapers PO.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SO_ID = "so-1785093682500";
const ZEGNA_PO_ID = "po-1785094704356-ek8nrh";
const DRAPERS_PO_ID = "po-1785094704356-kgll7f";
const FABRIC_NUMBERS = new Set(["91243", "66046", "66044"]);
const LINE_IDS = new Set([
  "line-1785093682499-1",
  "line-1785093682499-2",
  "line-1785093682499-3",
  "line-1785093682500-4",
]);

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

async function syncDoc(id, data) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    console.warn("Skipping Supabase sync — no credentials");
    return false;
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const updated_at = new Date().toISOString();
  const payload = { ...data, updated_at: data.updated_at ?? updated_at };
  const { error } = await admin.from("erp_documents").upsert(
    { id, data: payload, updated_at },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Supabase upsert ${id} failed: ${error.message}`);
  return true;
}

function isTargetLine(line) {
  return LINE_IDS.has(line.id) || FABRIC_NUMBERS.has(String(line.fabric_number ?? "").trim());
}

async function main() {
  const soPath = resolve("src/data/sales-orders.json");
  const poPath = resolve("fabric-orders.local.json");

  const soStore = JSON.parse(readFileSync(soPath, "utf8"));
  const poStore = JSON.parse(readFileSync(poPath, "utf8"));

  const order = soStore.orders.find((o) => o.id === SO_ID);
  if (!order) throw new Error(`Sales order ${SO_ID} not found`);

  const updatedLines = [];
  for (const line of order.fabric_lines) {
    if (!isTargetLine(line)) continue;
    if (line.supplier_id === "zegna" && line.supplier_name === "Zegna") {
      updatedLines.push({ id: line.id, fabric_number: line.fabric_number, already: true });
      continue;
    }
    line.supplier_id = "zegna";
    line.supplier_name = "Zegna";
    updatedLines.push({ id: line.id, fabric_number: line.fabric_number, supplier: "zegna" });
  }

  const line50024 = order.fabric_lines.find((l) => l.fabric_number === "50024");
  if (!line50024 || line50024.supplier_id !== "zegna") {
    throw new Error("Expected 50024 to already be Zegna");
  }

  const zegnaPo = poStore.orders.find((o) => o.id === ZEGNA_PO_ID);
  const drapersPo = poStore.orders.find((o) => o.id === DRAPERS_PO_ID);
  if (!zegnaPo) throw new Error(`Zegna PO ${ZEGNA_PO_ID} not found`);
  if (!drapersPo) throw new Error(`Drapers PO ${DRAPERS_PO_ID} not found`);

  const zegnaSupplier = { ...zegnaPo.supplier };
  zegnaPo.lines.push(...drapersPo.lines.map((line) => ({ ...line })));
  zegnaPo.total_amount = zegnaPo.lines.reduce((sum, line) => sum + (line.unit_price ?? 0) * (line.quantity_ordered ?? 0), 0);

  poStore.orders = poStore.orders.filter((o) => o.id !== DRAPERS_PO_ID);
  order.fabric_po_ids = order.fabric_po_ids.filter((id) => id !== DRAPERS_PO_ID);

  soStore.updated_at = new Date().toISOString();
  poStore.updated_at = new Date().toISOString();
  writeFileSync(soPath, `${JSON.stringify(soStore, null, 2)}\n`);
  writeFileSync(poPath, `${JSON.stringify(poStore, null, 2)}\n`);

  loadEnvLocal();
  await syncDoc("sales_orders", soStore);
  await syncDoc("fabric_orders", poStore);

  console.log(
    JSON.stringify(
      {
        sales_order: order.so_number,
        lines_updated: updatedLines,
        confirmed_50024_zegna: true,
        merged_po: {
          kept: ZEGNA_PO_ID,
          removed: DRAPERS_PO_ID,
          supplier: zegnaSupplier.name,
          line_count: zegnaPo.lines.length,
          status: zegnaPo.status,
        },
        fabric_po_ids: order.fabric_po_ids,
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
