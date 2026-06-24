#!/usr/bin/env node
/**
 * Apply Drapers supplier invoice 2606784 (order 6784) to SO-2026-0008 / INV-2026-0004.
 *
 * Usage:
 *   node scripts/apply-drapers-invoice-inv0004.mjs
 *   node scripts/apply-drapers-invoice-inv0004.mjs --sync
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const ROOT = process.cwd();
const PDF_SOURCE = "/Users/ralphrahme/Downloads/2606784.pdf";
const SO_ID = "so-cu-86exexf56";
const INVOICE_ID = "inv-1782243749301-hhtam5";
const EUR_TO_SAR = Number.parseFloat(process.env.EUR_TO_SAR ?? "4.5") || 4.5;

/** Drapers invoice 2606784 — CONFERMA D'ORDINE 6784, 10/04/26, EUR */
const SUPPLIER_INVOICE = {
  supplier_id: "drapers",
  supplier_name: "Drapers",
  invoice_number: "2606784",
  web_id: "83317467",
  po_number: "6784",
  order_reference: "CONFERMA D'ORDINE 6784",
  currency: "EUR",
  amount: "3358.60",
  invoice_date: "2026-04-10",
  lines: [
    { fabric_number: "60058", quantity: 4.1, unit_price: 50.1, amount: 205.41, composition: "100% WV" },
    { fabric_number: "60087", quantity: 4.1, unit_price: 43.1, amount: 176.71, composition: "100% WV" },
    { fabric_number: "60080", quantity: 4.1, unit_price: 43.1, amount: 176.71, composition: "100% WV" },
    { fabric_number: "60045", quantity: 4.1, unit_price: 43.1, amount: 176.71, composition: "100% WV" },
    { fabric_number: "60048", quantity: 4.1, unit_price: 43.1, amount: 176.71, composition: "100% WV" },
    { fabric_number: "60082", quantity: 4.1, unit_price: 43.1, amount: 176.71, composition: "100% WV" },
    { fabric_number: "85132", quantity: 2.5, unit_price: 290, amount: 725, composition: "100% WS" },
    { fabric_number: "85131", quantity: 2.4, unit_price: 290, amount: 696, composition: "100% WS" },
    { fabric_number: "85125", quantity: 2.4, unit_price: 290, amount: 696, composition: "100% WS" },
  ],
};

const OVERCOAT_FABRICS = new Set(["85125", "85132", "85131"]);

function loadEnvLocal() {
  const envPath = resolve(ROOT, ".env.local");
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

function readJson(rel, fallback) {
  const full = resolve(ROOT, rel);
  if (!existsSync(full)) return structuredClone(fallback);
  return JSON.parse(readFileSync(full, "utf8"));
}

function writeJson(rel, data) {
  const full = resolve(ROOT, rel);
  writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function roundMoney(amount) {
  return Math.round(amount * 100) / 100;
}

function readGarmentRate(garmentType) {
  const rates = readJson("src/data/costing-rates.json", {
    garment_rates: {},
    default_garment_rate: { labor: 150, washing: 40, overhead: 50 },
    fabric_import: { customs_duty_rate: 0.05, import_vat_rate: 0.15 },
  });
  return rates.garment_rates[garmentType] ?? rates.default_garment_rate;
}

function fabricImportCost(fabricBaseSar) {
  const rates = readJson("src/data/costing-rates.json", {
    fabric_import: { customs_duty_rate: 0.05, import_vat_rate: 0.15 },
  });
  const dutyRate = rates.fabric_import?.customs_duty_rate ?? 0.05;
  const base = roundMoney(fabricBaseSar);
  const customsDuty = roundMoney(base * dutyRate);
  return roundMoney(base + customsDuty);
}

function lineTotalCostSar(fabricLine) {
  if (!fabricLine.unit_price || fabricLine.unit_price <= 0) return null;
  const fabricBase = roundMoney(fabricLine.unit_price * fabricLine.quantity * EUR_TO_SAR);
  const fabricCost = fabricImportCost(fabricBase);
  const rate = readGarmentRate(fabricLine.garment_type);
  return roundMoney(fabricCost + rate.labor + rate.washing + rate.overhead);
}

function unitCostHintForFabricLine(fabricLine) {
  const total = lineTotalCostSar(fabricLine);
  if (total == null) return null;
  const stickerCount = Math.max(fabricLine.label_stickers?.length ?? fabricLine.label_count, 1);
  return roundMoney(total / stickerCount);
}

function findFabricLineForInvoiceLine(order, invoiceLine) {
  if (invoiceLine.sales_order_line_id) {
    const byId = order.fabric_lines.find((line) => line.id === invoiceLine.sales_order_line_id);
    if (byId) return byId;
  }
  if (invoiceLine.sticker_code) {
    const bySticker = order.fabric_lines.find((line) =>
      line.label_stickers?.some((sticker) => sticker.code === invoiceLine.sticker_code)
    );
    if (bySticker) return bySticker;
  }
  if (invoiceLine.fabric_number) {
    const byFabric = order.fabric_lines.find((line) => line.fabric_number === invoiceLine.fabric_number);
    if (byFabric) return byFabric;
  }
  return undefined;
}

function invoiceDedupeKey(messageId, filename) {
  return `${(messageId ?? "no-message").toLowerCase()}::${filename.toLowerCase()}`;
}

function saveSupplierInvoicePdf() {
  if (!existsSync(PDF_SOURCE)) {
    throw new Error(`PDF not found: ${PDF_SOURCE}`);
  }

  const filesDir = resolve(ROOT, "supplier-invoices/files");
  mkdirSync(filesDir, { recursive: true });

  const original_filename = basename(PDF_SOURCE);
  const store = readJson("supplier-invoices.local.json", { invoices: [] });
  const dedupe = invoiceDedupeKey("manual-ajlan-inv0004-drapers-6784", original_filename);
  const existing = store.invoices.find(
    (row) => invoiceDedupeKey(row.message_id, row.original_filename) === dedupe
  );
  if (existing) {
    console.log(`Supplier invoice record already exists: ${existing.id}`);
    return existing;
  }

  const id = `inv-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const stored_filename = `${id}-${original_filename}`;
  copyFileSync(PDF_SOURCE, join(filesDir, stored_filename));
  const stat = readFileSync(join(filesDir, stored_filename));

  const record = {
    id,
    supplier_id: SUPPLIER_INVOICE.supplier_id,
    supplier_name: SUPPLIER_INVOICE.supplier_name,
    invoice_number: SUPPLIER_INVOICE.invoice_number,
    amount: SUPPLIER_INVOICE.amount,
    currency: SUPPLIER_INVOICE.currency,
    awb_numbers: [],
    po_number: SUPPLIER_INVOICE.po_number,
    subject: `Drapers invoice ${SUPPLIER_INVOICE.invoice_number} — order ${SUPPLIER_INVOICE.po_number} (Ajlan SO-2026-0008)`,
    from_address: "manual-upload@garment-erp.local",
    received_at: new Date().toISOString(),
    message_id: "manual-ajlan-inv0004-drapers-6784",
    original_filename,
    stored_filename,
    file_size: stat.length,
    created_at: new Date().toISOString(),
  };

  store.invoices.unshift(record);
  writeJson("supplier-invoices.local.json", store);
  console.log(`Saved supplier invoice PDF → supplier-invoices/files/${stored_filename}`);
  return record;
}

function applyFabricPricesToSalesOrder(order) {
  const priceByFabric = new Map(
    SUPPLIER_INVOICE.lines.map((line) => [line.fabric_number, line])
  );
  const updated = [];

  for (const fabricLine of order.fabric_lines) {
    if (fabricLine.supplier_id !== "drapers") continue;
    const invoiceLine = priceByFabric.get(fabricLine.fabric_number);
    if (!invoiceLine) continue;

    const before = {
      quantity: fabricLine.quantity,
      unit_price: fabricLine.unit_price,
    };

    fabricLine.unit_price = invoiceLine.unit_price;
    if (OVERCOAT_FABRICS.has(fabricLine.fabric_number)) {
      fabricLine.quantity = invoiceLine.quantity;
    }

    updated.push({
      fabric_number: fabricLine.fabric_number,
      garment_type: fabricLine.garment_type,
      line_id: fabricLine.id,
      before,
      after: {
        quantity: fabricLine.quantity,
        unit_price: fabricLine.unit_price,
      },
    });
  }

  return updated;
}

function enrichInvoiceCostHints(lines, order) {
  return lines.map((line) => {
    const fabricLine = findFabricLineForInvoiceLine(order, line);
    if (!fabricLine) return line;
    const hint = unitCostHintForFabricLine(fabricLine);
    if (hint == null) return line;
    return { ...line, cost_hint_sar: hint };
  });
}

function computeOrderTotalCostSar(order) {
  let total = 0;
  let missing = 0;
  for (const fabricLine of order.fabric_lines) {
    const lineTotal = lineTotalCostSar(fabricLine);
    if (lineTotal == null) {
      missing += 1;
      continue;
    }
    total += lineTotal;
  }
  if (missing === order.fabric_lines.length) return null;
  return roundMoney(total);
}

async function syncDocuments(documentIds) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase credentials in .env.local");
  }

  const specs = {
    sales_orders: { path: "src/data/sales-orders.json" },
    customer_invoices: { path: "src/data/customer-invoices.json" },
    supplier_invoices: { path: "supplier-invoices.local.json" },
  };

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const updated_at = new Date().toISOString();

  for (const id of documentIds) {
    const spec = specs[id];
    const data = readJson(spec.path, {});
    const { error } = await admin.from("erp_documents").upsert(
      { id, data, updated_at },
      { onConflict: "id" }
    );
    if (error) throw new Error(`${id}: ${error.message}`);
    console.log(`✓ synced ${id}`);
  }
}

async function main() {
  const sync = process.argv.includes("--sync");

  const supplierRecord = saveSupplierInvoicePdf();

  const salesOrdersFile = readJson("src/data/sales-orders.json", { updated_at: null, orders: [] });
  const order = salesOrdersFile.orders.find((row) => row.id === SO_ID);
  if (!order) throw new Error(`Sales order not found: ${SO_ID}`);

  const soUpdates = applyFabricPricesToSalesOrder(order);
  salesOrdersFile.updated_at = new Date().toISOString();
  writeJson("src/data/sales-orders.json", salesOrdersFile);

  const invoicesFile = readJson("src/data/customer-invoices.json", {
    updated_at: null,
    invoices: [],
  });
  const invoice = invoicesFile.invoices.find((row) => row.id === INVOICE_ID);
  if (!invoice) throw new Error(`Customer invoice not found: ${INVOICE_ID}`);

  const beforeHints = new Map(
    invoice.lines
      .filter((line) => line.fabric_brand === "Drapers")
      .map((line) => [line.sticker_code, line.cost_hint_sar])
  );

  invoice.lines = enrichInvoiceCostHints(invoice.lines, order);
  invoice.total_cost_sar = computeOrderTotalCostSar(order);

  const drapersStickerCosts = invoice.lines
    .filter((line) => line.fabric_brand === "Drapers")
    .map((line) => {
      const fabricLine = findFabricLineForInvoiceLine(order, line);
      return {
        sticker: line.sticker_code,
        fabric_number: line.fabric_number,
        garment: line.garment_type,
        cost_hint_sar: line.cost_hint_sar,
        fabric_line_total_sar: fabricLine ? lineTotalCostSar(fabricLine) : null,
        changed: beforeHints.get(line.sticker_code) !== line.cost_hint_sar,
      };
    });

  invoicesFile.updated_at = new Date().toISOString();
  writeJson("src/data/customer-invoices.json", invoicesFile);

  console.log("\n--- Supplier invoice ---");
  console.log(JSON.stringify(SUPPLIER_INVOICE, null, 2));
  console.log(`\nSupplier record id: ${supplierRecord.id}`);
  console.log("\n--- Sales order fabric price updates ---");
  for (const row of soUpdates) {
    console.log(
      `  ${row.fabric_number} (${row.garment_type}): qty ${row.before.quantity}→${row.after.quantity}, €${row.before.unit_price}→€${row.after.unit_price}/m`
    );
  }

  console.log("\n--- Drapers cost hints on INV-2026-0004 ---");
  for (const row of drapersStickerCosts) {
    const marker = row.changed ? " *updated*" : "";
    console.log(
      `  ${row.sticker}: ${row.fabric_number} → ${row.cost_hint_sar} SAR (line total ${row.fabric_line_total_sar} SAR)${marker}`
    );
  }
  console.log(`\nInvoice total_cost_sar: ${invoice.total_cost_sar}`);

  if (sync) {
    await syncDocuments(["sales_orders", "customer_invoices", "supplier_invoices"]);
  } else {
    console.log("\nRun with --sync to push sales_orders, customer_invoices, supplier_invoices to Supabase.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
