#!/usr/bin/env node
/**
 * Sync missing invoice lines from linked sales order (preserves entered prices on existing lines).
 *
 *   node scripts/sync-invoice-lines-from-so.mjs INV-2026-0007
 *   node scripts/sync-invoice-lines-from-so.mjs inv-1783519740276-idtevh --sync
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const INVOICES_PATH = "src/data/customer-invoices.json";
const ORDERS_PATH = "src/data/sales-orders.json";

const GARMENT_PIECES = {
  Suit: ["Jacket", "Trouser"],
  "Overshirt+Trouser": ["Overshirt", "Trouser"],
  "Shirt+Trouser": ["Shirt", "Trouser"],
  "Shirt+Trouser+Short": ["Shirt", "Trouser", "Short"],
  "Shirt+Short": ["Shirt", "Short"],
  "Thobe+Jacket": ["Thobe", "Jacket"],
  "Thobe+Vest": ["Thobe", "Vest"],
  "Fabric only": [],
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

function roundMoney(amount) {
  return Math.round(amount * 100) / 100;
}

function readJson(path, fallback) {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full)) return fallback;
  return JSON.parse(readFileSync(full, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(resolve(process.cwd(), path), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function getGarmentPieces(garmentType) {
  return GARMENT_PIECES[garmentType] ?? [garmentType];
}

function lineArticleFromStickerCode(code) {
  const match = code.match(/-L(\d+)(?:-|$)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function fabricLineArticleNumber(index) {
  return index + 1;
}

function pieceNamesFromInvoicePieceField(pieceName) {
  if (!pieceName?.trim()) return [];
  if (pieceName.includes(" + ")) return pieceName.split(" + ").map((name) => name.trim());
  return [pieceName.trim()];
}

function isJacketTrouserPieceSet(pieceNames) {
  const normalized = new Set(
    pieceNames.map((name) => {
      const trimmed = name.trim();
      if (/^trousers?$/i.test(trimmed)) return "Trouser";
      if (/^blazers?$/i.test(trimmed)) return "Jacket";
      return trimmed;
    })
  );
  return normalized.has("Jacket") && normalized.has("Trouser");
}

function resolveCombinedGarmentType(garmentType, pieceNames) {
  if (isJacketTrouserPieceSet(pieceNames)) return "Suit";
  return garmentType;
}

function formatCombinedGarmentDescription(garmentType, pieceNames) {
  if (pieceNames.length <= 1) return garmentType;
  const joinedPieces = pieceNames.join(" + ");
  if (garmentType.replace(/\s*\+\s*/g, "+") === pieceNames.join("+")) return joinedPieces;
  return `${garmentType} (${joinedPieces})`;
}

function lineDescription(garmentType, pieceName) {
  const pieces = pieceNamesFromInvoicePieceField(pieceName);
  if (pieces.length > 1) return formatCombinedGarmentDescription(garmentType, pieces);
  return pieceName?.trim() || garmentType;
}

function orderedPieceNames(garmentType, pieceNames) {
  const order = getGarmentPieces(garmentType);
  return [...pieceNames].sort((a, b) => {
    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);
    return (indexA === -1 ? order.length : indexA) - (indexB === -1 ? order.length : indexB);
  });
}

function fabricBrandLabel(line) {
  return line.supplier_name?.trim() || line.supplier_id || "—";
}

function buildInvoiceLinesFromSalesOrder(order) {
  const lines = [];
  let index = 0;

  for (const [fabricLineIndex, fabricLine] of order.fabric_lines.entries()) {
    const articleNumber = fabricLineArticleNumber(fabricLineIndex);
    const stickers =
      fabricLine.label_stickers?.length > 0
        ? fabricLine.label_stickers
        : Array.from({ length: fabricLine.label_count }, (_, i) => ({
            code: `${fabricLine.id}-L${String(i + 1).padStart(2, "0")}`,
            piece_name: fabricLine.garment_type,
            sequence: i + 1,
          }));

    const garmentPieces = getGarmentPieces(fabricLine.garment_type);
    if (garmentPieces.length > 1 && stickers.length > 1) {
      index += 1;
      const pieceNames = orderedPieceNames(
        fabricLine.garment_type,
        stickers.map((sticker) => sticker.piece_name)
      );
      lines.push({
        id: `inv-line-${order.id}-${index}`,
        article_number: articleNumber,
        sales_order_line_id: fabricLine.id,
        description: formatCombinedGarmentDescription(
          resolveCombinedGarmentType(fabricLine.garment_type, pieceNames),
          pieceNames
        ),
        garment_type: resolveCombinedGarmentType(fabricLine.garment_type, pieceNames),
        piece_name: pieceNames.join(" + "),
        sticker_code: stickers[0].code,
        fabric_number: fabricLine.fabric_number,
        fabric_brand: fabricBrandLabel(fabricLine),
        composition: fabricLine.composition,
        weight_gsm: fabricLine.weight_gsm,
        quantity: 1,
        unit_price: 0,
        line_total: 0,
        cost_hint_sar: null,
        fabric_cost_hint_sar: null,
      });
      continue;
    }

    for (const sticker of stickers) {
      index += 1;
      lines.push({
        id: `inv-line-${order.id}-${index}`,
        article_number: lineArticleFromStickerCode(sticker.code) ?? articleNumber,
        sales_order_line_id: fabricLine.id,
        description: lineDescription(fabricLine.garment_type, sticker.piece_name),
        garment_type: fabricLine.garment_type,
        piece_name: sticker.piece_name,
        sticker_code: sticker.code,
        fabric_number: fabricLine.fabric_number,
        fabric_brand: fabricBrandLabel(fabricLine),
        composition: fabricLine.composition,
        weight_gsm: fabricLine.weight_gsm,
        quantity: 1,
        unit_price: 0,
        line_total: 0,
        cost_hint_sar: null,
        fabric_cost_hint_sar: null,
      });
    }
  }

  return lines;
}

function invoiceLineGroupKey(line) {
  return [
    line.garment_type,
    line.composition ?? "",
    line.weight_gsm ?? "",
    line.fabric_brand ?? "",
    line.unit_price,
  ].join("|");
}

function applySuitCombine(lines) {
  const groups = new Map();
  for (const line of lines) {
    if (!line.sales_order_line_id) continue;
    const key = line.sales_order_line_id;
    const bucket = groups.get(key) ?? [];
    bucket.push(line);
    groups.set(key, bucket);
  }

  const mergedIds = new Set();
  const output = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const pieceNames = group.flatMap((line) => pieceNamesFromInvoicePieceField(line.piece_name));
    if (!isJacketTrouserPieceSet(pieceNames)) continue;

    const merged = {
      ...group[0],
      garment_type: "Suit",
      piece_name: orderedPieceNames(group[0].garment_type, pieceNames).join(" + "),
      description: formatCombinedGarmentDescription("Suit", orderedPieceNames(group[0].garment_type, pieceNames)),
      unit_price: roundMoney(group.reduce((sum, line) => sum + line.unit_price, 0)),
      line_total: roundMoney(group.reduce((sum, line) => sum + line.line_total, 0)),
      quantity: 1,
      article_number: Math.min(...group.map((line) => line.article_number ?? Number.MAX_SAFE_INTEGER)),
    };
    for (const line of group) mergedIds.add(line.id);
    output.push(merged);
  }

  const kept = lines.filter((line) => !mergedIds.has(line.id));
  return [...kept, ...output];
}

function applyConsolidateDuplicates(lines) {
  const groups = new Map();
  for (const line of lines) {
    const key = invoiceLineGroupKey(line);
    const bucket = groups.get(key) ?? [];
    bucket.push(line);
    groups.set(key, bucket);
  }

  const output = [];
  for (const group of groups.values()) {
    if (group.length === 1 || group[0].unit_price === 0) {
      output.push(...group);
      continue;
    }
    const quantity = group.reduce((sum, line) => sum + line.quantity, 0);
    output.push({
      ...group[0],
      quantity,
      line_total: roundMoney(group[0].unit_price * quantity),
      article_number: Math.min(...group.map((line) => line.article_number ?? Number.MAX_SAFE_INTEGER)),
    });
  }
  return output;
}

function applyAllInvoiceLineReductions(lines) {
  return applyConsolidateDuplicates(applySuitCombine(lines));
}

function sortInvoiceLinesByArticle(lines) {
  return [...lines].sort((a, b) => {
    const artA = a.article_number ?? Number.MAX_SAFE_INTEGER;
    const artB = b.article_number ?? Number.MAX_SAFE_INTEGER;
    if (artA !== artB) return artA - artB;
    return a.id.localeCompare(b.id);
  });
}

function recalculateInvoiceTotals(lines, vatRate) {
  const normalized = lines.map((line) => {
    const lineTotal = roundMoney(line.quantity * line.unit_price);
    return { ...line, line_total: lineTotal };
  });
  const subtotal = roundMoney(normalized.reduce((sum, line) => sum + line.line_total, 0));
  const rate = vatRate != null && vatRate > 0 ? vatRate : 0;
  const vat_amount = rate > 0 ? roundMoney(subtotal * rate) : 0;
  const total = roundMoney(subtotal + vat_amount);
  return { lines: normalized, subtotal, vat_amount, total };
}

function syncInvoiceLinesFromSalesOrder(invoice, order) {
  const built = applyAllInvoiceLineReductions(buildInvoiceLinesFromSalesOrder(order));
  const existingByArticle = new Map(
    invoice.lines.filter((line) => line.article_number != null).map((line) => [line.article_number, line])
  );
  const coveredSalesOrderLineIds = new Set(
    invoice.lines.map((line) => line.sales_order_line_id).filter(Boolean)
  );
  const invoiceCreatedAt = invoice.created_at ? Date.parse(invoice.created_at) : 0;
  const fabricLineById = new Map(order.fabric_lines.map((line) => [line.id, line]));

  const merged = [];
  const seenArticles = new Set();

  for (const builtLine of built) {
    const article = builtLine.article_number;
    if (article == null) continue;
    seenArticles.add(article);
    const existing = existingByArticle.get(article);
    if (existing) {
      merged.push({
        ...builtLine,
        ...existing,
        id: existing.id,
        unit_price: existing.unit_price,
        quantity: existing.quantity,
        line_total: roundMoney(existing.quantity * existing.unit_price),
      });
      continue;
    }

    const fabricLineId = builtLine.sales_order_line_id?.trim();
    if (fabricLineId && coveredSalesOrderLineIds.has(fabricLineId)) continue;

    const fabricLine = fabricLineId ? fabricLineById.get(fabricLineId) : undefined;
    if (fabricLine?.added_at && invoiceCreatedAt > 0) {
      const addedAt = Date.parse(fabricLine.added_at);
      if (!Number.isNaN(addedAt) && addedAt <= invoiceCreatedAt) continue;
    }

    merged.push(builtLine);
    if (fabricLineId) coveredSalesOrderLineIds.add(fabricLineId);
  }

  for (const line of invoice.lines) {
    if (line.article_number != null && !seenArticles.has(line.article_number)) {
      merged.push(line);
    }
  }

  const lines = sortInvoiceLinesByArticle(merged);
  const totals = recalculateInvoiceTotals(lines, invoice.vat_rate);
  return { ...invoice, ...totals, lines: totals.lines };
}

async function syncCustomerInvoices(data) {
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
  console.log("✓ synced customer_invoices to Supabase");
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const sync = process.argv.includes("--sync");
  if (args.length === 0) {
    console.error("Usage: sync-invoice-lines-from-so.mjs <invoice-number|id> [--sync]");
    process.exit(1);
  }

  const invoicesFile = readJson(INVOICES_PATH, { updated_at: null, invoices: [] });
  const ordersFile = readJson(ORDERS_PATH, { updated_at: null, orders: [] });

  const invoice = invoicesFile.invoices.find(
    (row) => args.includes(row.id) || args.includes(row.invoice_number)
  );
  if (!invoice) throw new Error(`Invoice not found: ${args.join(", ")}`);

  const order = ordersFile.orders.find((row) => row.id === invoice.sales_order_id);
  if (!order) throw new Error(`Sales order not found: ${invoice.sales_order_id}`);

  const before = invoice.lines.length;
  const updated = syncInvoiceLinesFromSalesOrder(invoice, order);
  const index = invoicesFile.invoices.findIndex((row) => row.id === invoice.id);
  invoicesFile.invoices[index] = updated;
  invoicesFile.updated_at = new Date().toISOString();
  writeJson(INVOICES_PATH, invoicesFile);

  console.log(
    `${invoice.invoice_number}: ${before} → ${updated.lines.length} lines, subtotal SAR ${updated.subtotal}`
  );
  const added = updated.lines
    .filter((line) => !invoice.lines.some((existing) => existing.article_number === line.article_number))
    .map((line) => `L${String(line.article_number).padStart(2, "0")} ${line.description}`);
  if (added.length > 0) {
    console.log("Added:");
    for (const row of added) console.log(`  - ${row}`);
  }

  if (sync) await syncCustomerInvoices(invoicesFile);
  else console.log("\nRun with --sync to push customer_invoices to Supabase.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
