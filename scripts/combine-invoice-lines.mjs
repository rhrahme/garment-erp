#!/usr/bin/env node
/**
 * Combine multi-piece garment invoice lines (suit jacket+trouser, etc.) on stored invoices.
 *
 * Usage:
 *   node scripts/combine-invoice-lines.mjs inv-1782243749301-hhtam5
 *   node scripts/combine-invoice-lines.mjs --all
 *   node scripts/combine-invoice-lines.mjs inv-1782243749301-hhtam5 --sync
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const INVOICES_PATH = "src/data/customer-invoices.json";

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

function roundMoney(amount) {
  return Math.round(amount * 100) / 100;
}

function getGarmentPieces(garmentType) {
  return GARMENT_PIECES[garmentType] ?? [garmentType];
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
  return `${garmentType} (${pieceNames.join(" + ")})`;
}

function pieceNamesFromLine(pieceName) {
  if (!pieceName?.trim()) return [];
  if (pieceName.includes(" + ")) return pieceName.split(" + ").map((name) => name.trim());
  return [pieceName.trim()];
}

function isMultiPieceGarment(garmentType) {
  return getGarmentPieces(garmentType).length > 1;
}

function isCombinedInvoiceLine(line) {
  return pieceNamesFromLine(line.piece_name).length > 1;
}

function orderedPieceNames(garmentType, pieceNames) {
  const order = getGarmentPieces(garmentType);
  return [...pieceNames].sort((a, b) => {
    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);
    return (indexA === -1 ? order.length : indexA) - (indexB === -1 ? order.length : indexB);
  });
}

function invoiceLineGroupKey(line) {
  if (line.sales_order_line_id) return `sol:${line.sales_order_line_id}`;
  if (line.article_number != null) return `art:${line.article_number}:${line.garment_type}`;
  const fabricNumber = line.fabric_number?.trim();
  const fabricBrand = line.fabric_brand?.trim();
  if (fabricNumber && fabricBrand) {
    return `fab:${fabricBrand}|${fabricNumber}|${line.garment_type}`;
  }
  return null;
}

function mergeInvoiceLineGroup(group) {
  const first = group[0];
  const pieceNames = orderedPieceNames(
    first.garment_type,
    group.flatMap((line) => pieceNamesFromLine(line.piece_name))
  );
  const garmentType = resolveCombinedGarmentType(first.garment_type, pieceNames);
  const unitPrice = roundMoney(group.reduce((sum, line) => sum + line.unit_price, 0));
  const lineTotal = roundMoney(group.reduce((sum, line) => sum + line.line_total, 0));
  const costHints = group.map((line) => line.cost_hint_sar).filter((hint) => hint != null);
  const costHint = costHints.length > 0 ? roundMoney(costHints.reduce((sum, hint) => sum + hint, 0)) : null;

  return {
    ...first,
    garment_type: garmentType,
    description: formatCombinedGarmentDescription(garmentType, pieceNames),
    piece_name: pieceNames.join(" + "),
    sticker_code: first.sticker_code,
    quantity: 1,
    unit_price: unitPrice,
    line_total: lineTotal,
    cost_hint_sar: costHint,
  };
}

function combineInvoiceLines(lines) {
  const firstIndex = new Map();
  const groups = new Map();
  const standalone = [];

  lines.forEach((line, index) => {
    if (!isMultiPieceGarment(line.garment_type) || isCombinedInvoiceLine(line)) {
      standalone.push({ index, line });
      return;
    }

    const key = invoiceLineGroupKey(line);
    if (!key) {
      standalone.push({ index, line });
      return;
    }

    if (!firstIndex.has(key)) firstIndex.set(key, index);
    const bucket = groups.get(key) ?? [];
    bucket.push(line);
    groups.set(key, bucket);
  });

  const output = [...standalone];

  for (const [key, group] of groups) {
    const index = firstIndex.get(key) ?? 0;
    if (group.length > 1) {
      output.push({ index, line: mergeInvoiceLineGroup(group) });
    } else {
      output.push({ index, line: group[0] });
    }
  }

  return output.sort((a, b) => a.index - b.index).map((row) => row.line);
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

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function readJson(path, fallback) {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full)) return fallback;
  return JSON.parse(readFileSync(full, "utf8"));
}

function writeJson(path, data) {
  writeFileSync(resolve(process.cwd(), path), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function syncCustomerInvoices(data) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase credentials in .env.local");
  }

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

function applyCombine(invoice) {
  const before = invoice.lines.length;
  const combined = combineInvoiceLines(invoice.lines);
  const { lines, subtotal, vat_amount, total } = recalculateInvoiceTotals(
    combined,
    invoice.vat_rate
  );
  return {
    ...invoice,
    lines,
    subtotal,
    vat_amount,
    total,
    before,
    after: lines.length,
  };
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const sync = process.argv.includes("--sync");
  const all = process.argv.includes("--all");

  if (!all && args.length === 0) {
    console.error("Usage: combine-invoice-lines.mjs <invoice-id> [--sync] | --all [--sync]");
    process.exit(1);
  }

  const file = readJson(INVOICES_PATH, { updated_at: null, invoices: [] });
  const targets = all
    ? file.invoices
    : file.invoices.filter((invoice) => args.includes(invoice.id) || args.includes(invoice.invoice_number));

  if (targets.length === 0) {
    throw new Error(`No matching invoices for: ${args.join(", ")}`);
  }

  for (const invoice of targets) {
    const updated = applyCombine(invoice);
    const index = file.invoices.findIndex((row) => row.id === invoice.id);
    if (index < 0) continue;
    const { before, after, ...stored } = updated;
    file.invoices[index] = stored;
    console.log(`${invoice.invoice_number} (${invoice.id}): ${before} → ${after} lines`);
  }

  file.updated_at = new Date().toISOString();
  writeJson(INVOICES_PATH, file);

  if (sync) {
    await syncCustomerInvoices(file);
  } else {
    console.log("\nRun with --sync to push customer_invoices to Supabase.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
