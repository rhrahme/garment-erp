#!/usr/bin/env node
/**
 * Apply supplier reply availability to sales order fabric lines.
 * Resolves sales orders via fabric_po_ids when fabric PO records are missing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd());

function readJson(relPath, fallback) {
  const path = resolve(ROOT, relPath);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeFabricToken(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^N(?=\d)/, "")
    .replace(/^S(?=\d)/, "S");
}

function fabricNumbersMatch(a, b) {
  return normalizeFabricToken(a) === normalizeFabricToken(b);
}

function mapLineUpdateToSalesOrderFields(update) {
  switch (update.status) {
    case "temp_unavailable":
      return {
        stock_status: "temp_unavailable",
        restock_date: update.restock_date ?? null,
        needs_replacement: false,
        replacement_fabric_number: null,
      };
    case "permanently_unavailable":
      return {
        stock_status: "permanently_unavailable",
        restock_date: null,
        needs_replacement: true,
        replacement_fabric_number: null,
      };
    case "substituted":
      return {
        stock_status: "permanently_unavailable",
        restock_date: null,
        needs_replacement: true,
        replacement_fabric_number: update.substitute_fabric_number ?? null,
      };
    default:
      return null;
  }
}

function findSalesOrderByFabricPoId(orders, fabricPoId) {
  const id = String(fabricPoId ?? "").trim();
  if (!id) return undefined;
  return orders.find((order) => order.fabric_po_ids?.includes(id));
}

function resolveSalesOrderId(orders, purchaseOrder, purchaseOrderId) {
  if (purchaseOrder?.sales_order_id) return purchaseOrder.sales_order_id;
  if (purchaseOrderId) return findSalesOrderByFabricPoId(orders, purchaseOrderId)?.id ?? null;
  return null;
}

function lineMatchesSupplier(lineSupplierId, supplierId) {
  if (!supplierId) return true;
  return lineSupplierId === supplierId;
}

const salesStore = readJson("src/data/sales-orders.json", { orders: [] });
const repliesStore = readJson("supplier-replies.local.json", { replies: [] });
const fabricStore = readJson("fabric-orders.local.json", { orders: [] });

const totals = {
  replies_processed: 0,
  sales_orders_updated: 0,
  sales_order_lines_updated: 0,
};

for (const reply of repliesStore.replies ?? []) {
  const lineUpdates = (reply.line_updates ?? []).filter((update) =>
    ["temp_unavailable", "permanently_unavailable", "substituted"].includes(update.status)
  );
  if (lineUpdates.length === 0) continue;

  totals.replies_processed += 1;

  const purchaseOrder =
    (reply.purchase_order_id
      ? fabricStore.orders.find((order) => order.id === reply.purchase_order_id)
      : undefined) ??
    (reply.po_number
      ? fabricStore.orders.find(
          (order) => order.po_number?.toUpperCase() === String(reply.po_number).trim().toUpperCase()
        )
      : undefined);

  const supplierId = reply.supplier_id ?? purchaseOrder?.supplier_id ?? null;
  const salesOrderId = resolveSalesOrderId(salesStore.orders, purchaseOrder, reply.purchase_order_id);
  if (!salesOrderId) continue;

  const orderIndex = salesStore.orders.findIndex((order) => order.id === salesOrderId);
  if (orderIndex < 0) continue;

  const order = salesStore.orders[orderIndex];
  let orderChanged = false;

  const fabric_lines = order.fabric_lines.map((line) => {
    if (!lineMatchesSupplier(line.supplier_id, supplierId)) return line;
    const update = lineUpdates.find((item) => fabricNumbersMatch(item.fabric_number, line.fabric_number));
    if (!update) return line;
    const fields = mapLineUpdateToSalesOrderFields(update);
    if (!fields) return line;
    orderChanged = true;
    totals.sales_order_lines_updated += 1;
    return { ...line, ...fields };
  });

  if (orderChanged) {
    salesStore.orders[orderIndex] = { ...order, fabric_lines };
    totals.sales_orders_updated += 1;
  }
}

salesStore.updated_at = new Date().toISOString();
writeFileSync(resolve(ROOT, "src/data/sales-orders.json"), `${JSON.stringify(salesStore, null, 2)}\n`);
console.log(JSON.stringify(totals, null, 2));
