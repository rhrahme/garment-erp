#!/usr/bin/env node
/**
 * Sync Drapers live stock via official API (GET /stock/).
 * Requires DRAPERS_API_KEY in .env.local
 *
 * Usage:
 *   node scripts/sync-drapers-stock.mjs --open-orders
 *   node scripts/sync-drapers-stock.mjs --catalog
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const CATALOG_PATH = resolve(ROOT, "src/data/suppliers/drapers-hs-ss26.json");
const BASE = (process.env.DRAPERS_API_BASE_URL || "https://api.drapersitaly.it").replace(/\/$/, "");
const PAGE_LIMIT = 25;

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

function normalizeCode(n) {
  return n.trim().replace(/\s+/g, "").replace(/^DP/i, "");
}

function mapStock(row) {
  if (row.in_stock) return { stock_status: "in_stock", restock_date: null };
  if (row.in_restock || row.restock_date) {
    return { stock_status: "temp_unavailable", restock_date: row.restock_date };
  }
  return { stock_status: "permanently_unavailable", restock_date: null };
}

async function apiGet(path, query = {}) {
  const key = process.env.DRAPERS_API_KEY?.trim();
  if (!key) throw new Error("DRAPERS_API_KEY missing in .env.local");
  const url = new URL(`${BASE}/${path.replace(/^\//, "").replace(/\/$/, "")}/`);
  url.searchParams.set("ak", key);
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  const json = await res.json();
  if (json.status === "error") throw new Error(json.error?.message || "API error");
  return json;
}

function codeCandidates(fabricNumber) {
  const trimmed = fabricNumber.trim();
  const normalized = normalizeCode(trimmed);
  const out = [];
  for (const c of [normalized, trimmed, `DP${normalized}`]) {
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

async function lookupStock(fabricNumber) {
  let lastErr = null;
  for (const code of codeCandidates(fabricNumber)) {
    try {
      const payload = await apiGet(`stock/${encodeURIComponent(code)}`);
      const row = Array.isArray(payload.data) ? payload.data[0] : payload.data;
      if (row?.fabric_code) return row;
      lastErr = "Fabric not found";
    } catch (err) {
      lastErr = err instanceof Error ? err.message : "lookup failed";
    }
  }
  return { error: lastErr ?? "not found", fabric_number: fabricNumber };
}

async function fetchAllStock(maxPages = 200) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const payload = await apiGet("stock", { page, limit: PAGE_LIMIT });
    const rows = Array.isArray(payload.data) ? payload.data : [];
    if (!rows.length) break;
    all.push(...rows);
    if (rows.length < PAGE_LIMIT) break;
  }
  return all;
}

function openOrderFabrics() {
  const orders = JSON.parse(readFileSync(resolve(ROOT, "src/data/sales-orders.json"), "utf8"));
  const nums = new Set();
  for (const o of orders.orders) {
    if (o.status === "complete") continue;
    for (const l of o.fabric_lines) {
      if (l.supplier_id === "drapers") nums.add(l.fabric_number.trim());
    }
  }
  return [...nums];
}

async function main() {
  loadEnvLocal();
  const openOnly = process.argv.includes("--open-orders");
  const catalog = process.argv.includes("--catalog") || !openOnly;

  const hello = await apiGet("helloworld");
  console.log("Account:", "Drapers API");
  console.log("Stock permission:", hello.data.capabilities.stock);

  const catalogFile = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  const byCode = new Map();
  for (const f of catalogFile.fabrics) {
    byCode.set(normalizeCode(f.fabric_number), f);
    byCode.set(f.fabric_number.trim(), f);
  }

  const synced_at = new Date().toISOString();
  let updated = 0;
  let checked = 0;

  const notFound = [];

  if (openOnly && !catalog) {
    for (const num of openOrderFabrics()) {
      checked++;
      const row = await lookupStock(num);
      if (row.error) {
        notFound.push(`${num}: ${row.error}`);
        continue;
      }
      const fabric = byCode.get(normalizeCode(num)) ?? byCode.get(num.trim());
      if (!fabric) {
        notFound.push(`${num}: not in local catalog`);
        continue;
      }
      const mapped = mapStock(row);
      fabric.stock_status = mapped.stock_status;
      fabric.restock_date = mapped.restock_date;
      fabric.disponibilita_meters = parseFloat(String(row.quantity).replace(",", ".")) || 0;
      fabric.stock_updated_at = synced_at;
      updated++;
    }
  } else {
    const rows = await fetchAllStock();
    checked = rows.length;
    for (const row of rows) {
      const fabric = byCode.get(normalizeCode(row.fabric_code));
      if (!fabric) continue;
      const mapped = mapStock(row);
      fabric.stock_status = mapped.stock_status;
      fabric.restock_date = mapped.restock_date;
      fabric.disponibilita_meters = parseFloat(String(row.quantity).replace(",", ".")) || 0;
      fabric.stock_updated_at = synced_at;
      updated++;
    }
  }

  catalogFile.stock_synced_at = synced_at;
  catalogFile.stock_sync_source = "api.drapersitaly.it/stock";
  writeFileSync(CATALOG_PATH, `${JSON.stringify(catalogFile, null, 2)}\n`);

  console.log(JSON.stringify({ checked, updated, not_found: notFound.length, errors: notFound.slice(0, 10), synced_at }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
