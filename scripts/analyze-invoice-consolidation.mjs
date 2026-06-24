#!/usr/bin/env node
/**
 * Report invoice line consolidation opportunities.
 *
 *   node scripts/analyze-invoice-consolidation.mjs INV-2026-0005
 *   node scripts/analyze-invoice-consolidation.mjs --so SO-2026-0109
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_FIELDS = ["garment_type", "composition", "weight_gsm", "unit_price", "fabric_brand"];

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

function pieceNamesFromLine(pieceName) {
  if (!pieceName?.trim()) return [];
  if (pieceName.includes(" + ")) return pieceName.split(" + ").map((name) => name.trim());
  return [pieceName.trim()];
}

function isCombinedInvoiceLine(line) {
  return pieceNamesFromLine(line.piece_name).length > 1;
}

function canConsolidate(line) {
  if (getGarmentPieces(line.garment_type).length <= 1) return true;
  return isCombinedInvoiceLine(line);
}

function normalize(field, value) {
  if (field === "composition" || field === "fabric_brand") return String(value ?? "").trim().toLowerCase();
  if (field === "weight_gsm") return value == null ? "" : String(value);
  if (field === "unit_price") return Number.isFinite(Number(value)) ? String(roundMoney(Number(value))) : "";
  return String(value ?? "").trim().toLowerCase();
}

function mergeKey(line, fields = DEFAULT_FIELDS) {
  return fields.map((field) => normalize(field, line[field])).join("|");
}

function buildLinesFromOrder(order) {
  const lines = [];
  let index = 0;
  for (const fabricLine of order.fabric_lines) {
    const stickers =
      fabricLine.label_stickers?.length > 0
        ? fabricLine.label_stickers
        : Array.from({ length: fabricLine.label_count }, (_, i) => ({
            code: `${fabricLine.id}-L${i + 1}`,
            piece_name: fabricLine.garment_type,
          }));
    const garmentPieces = getGarmentPieces(fabricLine.garment_type);
    if (garmentPieces.length > 1 && stickers.length > 1) {
      index += 1;
      const pieceNames = stickers.map((s) => s.piece_name);
      lines.push({
        id: `inv-line-${order.id}-${index}`,
        garment_type: fabricLine.garment_type,
        piece_name: pieceNames.join(" + "),
        composition: fabricLine.composition,
        weight_gsm: fabricLine.weight_gsm,
        unit_price: 0,
        quantity: 1,
        line_total: 0,
        fabric_brand: fabricLine.supplier_name,
        description: fabricLine.garment_type,
      });
      continue;
    }
    for (const sticker of stickers) {
      index += 1;
      lines.push({
        id: `inv-line-${order.id}-${index}`,
        garment_type: fabricLine.garment_type,
        piece_name: sticker.piece_name,
        composition: fabricLine.composition,
        weight_gsm: fabricLine.weight_gsm,
        unit_price: 0,
        quantity: 1,
        line_total: 0,
        fabric_brand: fabricLine.supplier_name,
        description: sticker.piece_name,
      });
    }
  }
  return lines;
}

function analyze(lines) {
  const buckets = new Map();
  for (const line of lines) {
    if (!canConsolidate(line)) continue;
    const key = mergeKey(line);
    const bucket = buckets.get(key) ?? [];
    bucket.push(line);
    buckets.set(key, bucket);
  }
  const groups = [...buckets.entries()]
    .filter(([, bucket]) => bucket.length > 1)
    .map(([key, bucket]) => ({ key, lines: bucket }))
    .sort((a, b) => b.lines.length - a.lines.length);
  const after = lines.length - groups.reduce((sum, g) => sum + g.lines.length - 1, 0);
  return { before: lines.length, after, groups };
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

const args = process.argv.slice(2);
const soArg = args.find((arg) => arg.startsWith("--so"));
const invoiceArg = args.find((arg) => !arg.startsWith("--"));

const invoices = readJson("src/data/customer-invoices.json");
const orders = readJson("src/data/sales-orders.json");

let label = invoiceArg ?? "invoice";
let lines = [];
let meta = {};

if (soArg) {
  const soNumber = soArg.includes("=") ? soArg.split("=")[1] : args[args.indexOf(soArg) + 1];
  const order = orders.orders.find((row) => row.so_number === soNumber);
  if (!order) throw new Error(`Sales order not found: ${soNumber}`);
  label = soNumber;
  lines = buildLinesFromOrder(order);
  meta = { client: order.client_name, client_code: order.client_code };
} else {
  const invoice = invoices.invoices.find((row) => row.invoice_number === invoiceArg || row.id === invoiceArg);
  if (!invoice) {
    console.error(`Invoice not found: ${invoiceArg}`);
    console.error("Tip: project from sales order with --so SO-2026-0109");
    process.exit(1);
  }
  lines = invoice.lines;
  meta = {
    client: invoice.client_name,
    so_number: invoice.so_number,
    invoice_number: invoice.invoice_number,
  };
}

const result = analyze(lines);
console.log(`\n${label}`);
if (meta.client) console.log(`Client: ${meta.client}${meta.client_code ? ` (${meta.client_code})` : ""}`);
if (meta.so_number) console.log(`SO: ${meta.so_number}`);
console.log(`Lines: ${result.before} → ${result.after} (${result.before - result.after} saved)\n`);

for (const group of result.groups) {
  const sample = group.lines[0];
  console.log(
    `• ${group.lines.length} lines → 1: ${sample.garment_type} @ ${sample.unit_price} SAR` +
      ` | ${sample.composition ?? "—"}` +
      ` | ${sample.weight_gsm ?? "—"} gsm` +
      ` | ${sample.fabric_brand ?? "—"}`
  );
}

if (result.groups.length === 0) {
  console.log("No merge groups found with default key fields.");
}
