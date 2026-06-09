/**
 * Fabric receiving reset — same mutations as POST /api/fabric-receiving/reset-testing.
 *
 * Usage:
 *   node scripts/run-fabric-receiving-reset.mjs <sales_order_id>
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOCS = {
  sales_orders: {
    key: "sales_orders",
    path: "src/data/sales-orders.json",
    fallback: { updated_at: null, orders: [] },
  },
  fabric_receipts: {
    key: "fabric_receipts",
    path: "src/data/fabric-receipts.json",
    fallback: { updated_at: null, receipts: [] },
  },
  fabric_receipts_archive: {
    key: "fabric_receipts_archive",
    path: "src/data/fabric-receipts-archive.json",
    fallback: { updated_at: null, receipts: [] },
  },
  production_work_orders: {
    key: "production_work_orders",
    path: "src/data/production-work-orders.json",
    fallback: { updated_at: null, work_orders: [] },
  },
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

function readLocal(spec) {
  const fullPath = resolve(process.cwd(), spec.path);
  if (!existsSync(fullPath)) return structuredClone(spec.fallback);
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function writeLocal(spec, data) {
  const fullPath = resolve(process.cwd(), spec.path);
  writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readDoc(admin, spec) {
  if (!admin) return readLocal(spec);
  const { data, error } = await admin.from("erp_documents").select("data").eq("id", spec.key).maybeSingle();
  if (error) throw new Error(`Supabase read ${spec.key}: ${error.message}`);
  if (data?.data) return data.data;
  return readLocal(spec);
}

async function writeDoc(admin, spec, payload) {
  const next = { ...payload, updated_at: new Date().toISOString() };
  if (admin) {
    const { error } = await admin
      .from("erp_documents")
      .upsert({ id: spec.key, data: next, updated_at: next.updated_at }, { onConflict: "id" });
    if (error) throw new Error(`Supabase write ${spec.key}: ${error.message}`);
  }
  writeLocal(spec, next);
  return next;
}

function resolveResetLineIds(order, lineIds) {
  const orderLineIds = new Set(order.fabric_lines.map((line) => line.id));
  if (lineIds?.length) {
    const unknown = lineIds.filter((lineId) => !orderLineIds.has(lineId));
    if (unknown.length > 0) throw new Error("One or more fabric lines do not belong to this sales order.");
    return lineIds;
  }
  return order.fabric_lines.map((line) => line.id);
}

function clearFabricLinePrintTimestamps(lines, lineIds) {
  const idSet = new Set(lineIds);
  const cleared_line_ids = [];
  const nextLines = lines.map((line) => {
    if (!idSet.has(line.id)) return line;
    cleared_line_ids.push(line.id);
    return {
      ...line,
      a4_printed_at: null,
      prep_stickers_printed_at: null,
      prod_stickers_printed_at: null,
    };
  });
  return { lines: nextLines, cleared_line_ids };
}

async function removeFabricReceiptsForLineIds(admin, lineIds) {
  const lineIdSet = new Set(lineIds);
  const removedIds = new Set();

  const receipts = await readDoc(admin, DOCS.fabric_receipts);
  receipts.receipts = receipts.receipts.filter((receipt) => {
    if (lineIdSet.has(receipt.sales_order_line_id)) {
      removedIds.add(receipt.id);
      return false;
    }
    return true;
  });
  await writeDoc(admin, DOCS.fabric_receipts, receipts);

  const archive = await readDoc(admin, DOCS.fabric_receipts_archive);
  const nextArchive = archive.receipts.filter((receipt) => {
    if (lineIdSet.has(receipt.sales_order_line_id)) {
      removedIds.add(receipt.id);
      return false;
    }
    return true;
  });
  if (nextArchive.length !== archive.receipts.length) {
    await writeDoc(admin, DOCS.fabric_receipts_archive, { ...archive, receipts: nextArchive });
  }

  return [...removedIds];
}

async function removeProductionWorkOrdersForLineIds(admin, lineIds) {
  const lineIdSet = new Set(lineIds);
  const store = await readDoc(admin, DOCS.production_work_orders);
  const removedIds = [];
  const nextWorkOrders = store.work_orders.filter((workOrder) => {
    if (lineIdSet.has(workOrder.sales_order_line_id)) {
      removedIds.push(workOrder.id);
      return false;
    }
    return true;
  });
  if (removedIds.length > 0) {
    await writeDoc(admin, DOCS.production_work_orders, { ...store, work_orders: nextWorkOrders });
  }
  return removedIds;
}

loadEnvLocal();

const salesOrderId = process.argv[2]?.trim();
if (!salesOrderId) {
  console.error("Usage: node scripts/run-fabric-receiving-reset.mjs <sales_order_id>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
const useJson = process.env.ERP_USE_JSON === "true";
const admin =
  !useJson && url && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

console.log("Storage:", admin ? "supabase" : "local-json");

const salesOrders = await readDoc(admin, DOCS.sales_orders);
const orderIndex = salesOrders.orders.findIndex((order) => order.id === salesOrderId);
if (orderIndex < 0) throw new Error("Sales order not found.");

const order = salesOrders.orders[orderIndex];
if (!order.fabric_lines?.length) throw new Error("This sales order has no fabric lines.");

const resetLineIds = resolveResetLineIds(order);
const removedReceiptIds = await removeFabricReceiptsForLineIds(admin, resetLineIds);
const removedWorkOrderIds = await removeProductionWorkOrdersForLineIds(admin, resetLineIds);

const { lines, cleared_line_ids } = clearFabricLinePrintTimestamps(order.fabric_lines, resetLineIds);
salesOrders.orders[orderIndex] = { ...order, fabric_lines: lines };
await writeDoc(admin, DOCS.sales_orders, salesOrders);

const result = {
  sales_order_id: order.id,
  so_number: order.so_number,
  reset_line_ids: resetLineIds,
  removed_receipt_ids: removedReceiptIds,
  removed_work_order_ids: removedWorkOrderIds,
  cleared_print_line_ids: cleared_line_ids,
};

console.log(JSON.stringify(result, null, 2));
