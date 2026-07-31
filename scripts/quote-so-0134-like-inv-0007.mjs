#!/usr/bin/env node
/**
 * Create draft customer invoice (quote) for SO-2026-0134 using the same
 * price logic reverse-engineered from INV-2026-0007:
 *
 *   unit_price = round100(1.5 * fabric_cost_sar + garment_making)
 *
 * Fabric cost = catalog unit price * meters * FX * (1 + 5% duty for imports).
 * Making charges fitted from INV-2026-0007 garment types (rounded to 100 SAR).
 * Shirt+Trouser (not on INV-0007) uses Shirt+Short making (same 2-piece set).
 * DXB delivery ? no VAT (same as INV-0007).
 *
 *   node scripts/quote-so-0134-like-inv-0007.mjs
 *   node scripts/quote-so-0134-like-inv-0007.mjs --sync
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SO_NUMBER = "SO-2026-0134";
const ORDERS_PATH = "src/data/sales-orders.json";
const INVOICES_PATH = "src/data/customer-invoices.json";
const CLIENTS_PATH = "src/data/clients.json";
const RATES_PATH = "src/data/costing-rates.json";
const EVENTS_PATH = "integration-events.local.json";

const EUR_TO_SAR = 4.5;
const USD_TO_SAR = 3.75;
const AED_TO_SAR = 1.021;
const FABRIC_MARKUP = 1.5;

/** Fitted from INV-2026-0007 (K=1.5 * fabric_cost_sar + making). */
const MAKING_SAR = {
  "Shirt LS": 1900,
  "Shirt SS": 1900,
  "Shirt+Short": 4000,
  "Shirt+Trouser": 4000, // assumed = Shirt+Short (2-piece; not on INV-0007)
  Short: 2500,
  Trouser: 2100,
  Overshirt: 3300,
  Jacket: 3700,
  "Shirt+Trouser+Short": 5000,
  "Overshirt+Trouser": 5200,
  Suit: 5200,
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
    if (!process.env[key]) process.env[key] = value;
  }
}

function readJson(path, fallback = null) {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full)) return fallback;
  return JSON.parse(readFileSync(full, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(resolve(process.cwd(), path), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function roundMoney(amount) {
  return Math.round(amount * 100) / 100;
}

function round100(amount) {
  return Math.round(amount / 100) * 100;
}

function loadCatalogMaps() {
  const files = [
    ["src/data/suppliers/loro-piana-ss26.json", "EUR"],
    ["src/data/suppliers/caccioppoli-jackets-ss26.json", "EUR"],
    ["src/data/suppliers/caccioppoli-shirting-ss26.json", "EUR"],
    ["src/data/suppliers/stylbiella-ss26.json", "USD"],
    ["src/data/suppliers/gazaba-cutlength-price-list.json", "AED"],
  ];
  const maps = [];
  for (const [file, defaultCurrency] of files) {
    const data = readJson(file);
    if (!data?.fabrics) continue;
    const map = new Map();
    for (const fabric of data.fabrics) {
      const num = String(fabric.fabric_number ?? "").trim().toUpperCase();
      if (!num) continue;
      map.set(num, {
        unit_price: fabric.unit_price,
        currency: fabric.currency || defaultCurrency,
        composition: fabric.composition ?? null,
        weight_gsm: fabric.weight_gsm ?? null,
      });
    }
    maps.push(map);
  }
  return maps;
}

function findCatalogFabric(maps, fabricNumber) {
  const key = String(fabricNumber).trim().toUpperCase();
  for (const map of maps) {
    const hit = map.get(key);
    if (hit) return hit;
  }
  return null;
}

function supplierCurrency(supplierId, catalogCurrency) {
  if (supplierId === "gazaba") return "AED";
  if (supplierId === "stylbiella" || supplierId === "zegna") return "USD";
  return catalogCurrency || "EUR";
}

function toSar(amount, currency) {
  if (currency === "USD") return amount * USD_TO_SAR;
  if (currency === "AED") return amount * AED_TO_SAR;
  return amount * EUR_TO_SAR;
}

function isWarehouseSupplier(supplierId) {
  return supplierId === "canclini" || supplierId === "wool-stock";
}

function fabricCostSar(catalogMaps, fabricNumber, meters, supplierId, dutyRate) {
  const cat = findCatalogFabric(catalogMaps, fabricNumber);
  if (!cat || cat.unit_price == null || cat.unit_price <= 0) return null;
  const currency = supplierCurrency(supplierId, cat.currency);
  const base = roundMoney(toSar(cat.unit_price * meters, currency));
  if (isWarehouseSupplier(supplierId)) return base;
  return roundMoney(base * (1 + dutyRate));
}

function fabricBrandLabel(supplierId, supplierName, fabricNumber) {
  if (
    (supplierId === "loro-piana" || supplierId === "solbiati") &&
    /^S/i.test(String(fabricNumber))
  ) {
    return "Solbiati";
  }
  if (supplierId === "loro-piana") return "Loro Piana";
  return supplierName || supplierId;
}

function lineDescription(garmentType, stickers) {
  const pieces = (stickers || []).map((s) => s.piece_name).filter(Boolean);
  if (pieces.length > 1) return pieces.join(" + ");
  if (pieces.length === 1) return pieces[0];
  return garmentType;
}

function garmentRate(rates, garmentType) {
  return rates.garment_rates?.[garmentType] ?? rates.default_garment_rate;
}

function generateInvoiceNumber(invoices) {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  let max = 0;
  for (const invoice of invoices) {
    if (!invoice.invoice_number?.startsWith(prefix)) continue;
    const seq = Number.parseInt(invoice.invoice_number.slice(prefix.length), 10);
    if (!Number.isNaN(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

async function syncToSupabase(data) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !serviceKey) throw new Error("Missing Supabase credentials in .env.local");
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.from("erp_documents").upsert(
    { id: "customer_invoices", data, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) throw new Error(`customer_invoices: ${error.message}`);
  console.log("? synced customer_invoices to Supabase");
}

async function notifyInvoiceCreated(invoice) {
  loadEnvLocal();
  const payload = {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    sales_order_id: invoice.sales_order_id,
    so_number: invoice.so_number,
    client_id: invoice.client_id,
    client_name: invoice.client_name,
    total: invoice.total,
    currency: invoice.currency,
    _source: "erp",
    notes: "Quoted with INV-2026-0007 price logic (1.5- fabric cost + garment making)",
  };

  const log = readJson(EVENTS_PATH, { events: [] });
  log.events = [
    { event: "invoice.created", timestamp: new Date().toISOString(), data: payload },
    ...(log.events || []),
  ].slice(0, 200);
  writeJson(EVENTS_PATH, log);
  console.log("? logged invoice.created to integration-events.local.json");

  const webhook = process.env.ZAPIER_WEBHOOK_URL?.trim();
  if (!webhook) {
    console.log("- Zapier webhook not configured - skipped");
    return;
  }
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "invoice.created",
      timestamp: new Date().toISOString(),
      source: "erp",
      data: payload,
    }),
  });
  if (!response.ok) {
    console.warn("Zapier webhook HTTP error:", response.status, await response.text());
  } else {
    console.log("? emitted invoice.created to Zapier");
  }
}

async function main() {
  const sync = process.argv.includes("--sync");
  const catalogMaps = loadCatalogMaps();
  const rates = readJson(RATES_PATH);
  const dutyRate = rates?.fabric_import?.customs_duty_rate ?? 0.05;

  const ordersFile = readJson(ORDERS_PATH);
  const order = ordersFile.orders.find((row) => row.so_number === SO_NUMBER);
  if (!order) throw new Error(`Sales order not found: ${SO_NUMBER}`);

  const invoicesFile = readJson(INVOICES_PATH);
  const existing = invoicesFile.invoices.find((row) => row.sales_order_id === order.id);
  if (existing) {
    throw new Error(
      `Invoice already exists for ${SO_NUMBER}: ${existing.invoice_number} (${existing.id})`
    );
  }

  const clientsFile = readJson(CLIENTS_PATH, { clients: [] });
  const client = (clientsFile.clients || []).find((row) => row.id === order.client_id);
  const clientName = client
    ? [client.first_name, client.middle_name, client.last_name].filter(Boolean).join(" ")
    : order.client_name;

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const invoiceNumber = generateInvoiceNumber(invoicesFile.invoices);
  const invoiceId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const lines = [];
  let totalCostSar = 0;
  let missingCost = 0;

  for (const [index, fabricLine] of order.fabric_lines.entries()) {
    const articleNumber = index + 1;
    const stickers = fabricLine.label_stickers || [];
    const garmentType = fabricLine.garment_type;
    const pieceNames = stickers.map((s) => s.piece_name).filter(Boolean);
    const description = lineDescription(garmentType, stickers);
    const fabricCost = fabricCostSar(
      catalogMaps,
      fabricLine.fabric_number,
      fabricLine.quantity,
      fabricLine.supplier_id,
      dutyRate
    );
    const cat = findCatalogFabric(catalogMaps, fabricLine.fabric_number);
    const rate = garmentRate(rates, garmentType);
    const laborTotal = rate.labor + rate.washing + rate.overhead;
    const costHint =
      fabricCost != null ? roundMoney(fabricCost + laborTotal) : null;
    if (costHint != null) totalCostSar += costHint;
    else missingCost += 1;

    const making = MAKING_SAR[garmentType];
    if (making == null) {
      throw new Error(`No making charge mapped for garment type: ${garmentType}`);
    }
    if (fabricCost == null) {
      throw new Error(
        `Missing catalog price for ${fabricLine.fabric_number} (${fabricLine.supplier_id})`
      );
    }

    const unitPrice = round100(FABRIC_MARKUP * fabricCost + making);
    const brand = fabricBrandLabel(
      fabricLine.supplier_id,
      fabricLine.supplier_name,
      fabricLine.fabric_number
    );

    lines.push({
      id: `inv-line-${order.id}-${articleNumber}`,
      article_number: articleNumber,
      sales_order_line_id: fabricLine.id,
      description,
      garment_type: garmentType,
      piece_name: pieceNames.length > 1 ? pieceNames.join(" + ") : pieceNames[0] || garmentType,
      sticker_code: stickers[0]?.code ?? null,
      fabric_number: fabricLine.fabric_number,
      fabric_brand: brand,
      composition: fabricLine.composition ?? cat?.composition ?? null,
      weight_gsm: fabricLine.weight_gsm ?? cat?.weight_gsm ?? null,
      quantity: 1,
      unit_price: unitPrice,
      line_total: unitPrice,
      cost_hint_sar: costHint,
      fabric_cost_hint_sar: fabricCost,
    });
  }

  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.line_total, 0));
  // DXB ? no VAT (same as INV-2026-0007)
  const vat_rate = null;
  const vat_amount = 0;
  const total = subtotal;

  const invoice = {
    id: invoiceId,
    invoice_number: invoiceNumber,
    sales_order_id: order.id,
    so_number: order.so_number,
    client_id: order.client_id,
    client_code: order.client_code,
    client_name: clientName,
    client_reference: order.client_reference,
    client_email: client?.email ?? null,
    client_address: null,
    payment_terms: client?.payment_terms ?? null,
    currency: "SAR",
    status: "draft",
    invoice_date: today,
    due_date: null,
    lines,
    subtotal,
    vat_rate,
    vat_amount,
    total,
    notes:
      "Draft quote priced like INV-2026-0007: round100(1.5-fabric_cost_sar + garment making). Shirt+Trouser making assumed = Shirt+Short (4000).",
    created_at: now,
    updated_at: now,
    sent_at: null,
    paid_at: null,
    payments: [],
    factory_brand_name: "Fouad Rahme",
    total_cost_sar: roundMoney(totalCostSar),
    delivery_destination: order.delivery_destination,
  };

  invoicesFile.invoices.push(invoice);
  invoicesFile.updated_at = now;
  writeJson(INVOICES_PATH, invoicesFile);

  console.log(`Created ${invoiceNumber} (${invoiceId}) for ${SO_NUMBER}`);
  console.log(`Client: ${clientName} - ${order.delivery_destination} - VAT ${vat_rate ?? 0}`);
  console.log(`Lines: ${lines.length} - subtotal ${subtotal} - total ${total} SAR`);
  console.log(`Cost hint total: ${roundMoney(totalCostSar)} SAR (missing catalog: ${missingCost})`);
  console.log("\nLines:");
  for (const line of lines) {
    console.log(
      `  ${String(line.article_number).padStart(2)}. ${line.description.padEnd(22)} ${String(line.fabric_number).padEnd(10)} ${line.fabric_brand.padEnd(12)} qty ${line.quantity} - ${line.unit_price} = ${line.line_total}  (fab ${line.fabric_cost_hint_sar})`
    );
  }

  await notifyInvoiceCreated(invoice);

  if (sync) await syncToSupabase(invoicesFile);
  else console.log("\nRun with --sync to push customer_invoices to Supabase.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
