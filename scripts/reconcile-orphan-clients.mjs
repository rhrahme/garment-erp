#!/usr/bin/env node
/**
 * One-time / on-demand reconciliation: restore client profiles for any sales-order
 * client_id that is missing from erp_documents.clients (the Khaled / FR-0626-0037 class of bug).
 *
 *   node scripts/reconcile-orphan-clients.mjs
 *   node scripts/reconcile-orphan-clients.mjs --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");

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
    if (!process.env[key]) process.env[key] = value.replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();

const BRAND_CLIENT_CODE_PREFIX = {
  gliani: "GL",
  "fouad-rahme": "FR",
  fouad: "FD",
  "just-uniforms": "JU",
};

function brandIdFromClientCode(code) {
  const prefix = String(code ?? "")
    .trim()
    .toUpperCase()
    .split("-")[0];
  const entry = Object.entries(BRAND_CLIENT_CODE_PREFIX).find(([, value]) => value === prefix);
  return entry?.[0] ?? "fouad-rahme";
}

function migrateClientName(rawName) {
  const legacyName = String(rawName ?? "").trim();
  if (!legacyName) return { first_name: "Unknown", middle_name: null, last_name: "Client" };
  const parts = legacyName.split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], middle_name: null, last_name: "Client" };
  return {
    first_name: parts[0],
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(" ") : null,
    last_name: parts[parts.length - 1],
  };
}

function findOrphans(clients, orders) {
  const byId = new Map(clients.map((client) => [client.id, client]));
  const groups = new Map();
  for (const order of orders) {
    const clientId = String(order.client_id ?? "").trim();
    if (!clientId || byId.has(clientId)) continue;
    const existing = groups.get(clientId);
    if (existing) {
      existing.so_numbers.push(order.so_number);
      if (order.order_date && (!existing.earliest_order_date || order.order_date < existing.earliest_order_date)) {
        existing.earliest_order_date = order.order_date;
      }
      continue;
    }
    groups.set(clientId, {
      client_id: clientId,
      client_code: String(order.client_code ?? "").trim(),
      client_name: String(order.client_name ?? "").trim(),
      so_numbers: [order.so_number],
      earliest_order_date: order.order_date ?? null,
    });
  }
  return [...groups.values()];
}

function buildProfile(orphan) {
  const code = String(orphan.client_code ?? "").trim().toUpperCase();
  if (!code) return null;
  const names = migrateClientName(orphan.client_name);
  return {
    id: orphan.client_id,
    code,
    joined_at: orphan.earliest_order_date
      ? new Date(`${orphan.earliest_order_date}T00:00:00.000Z`).toISOString()
      : new Date().toISOString(),
    first_name: names.first_name,
    middle_name: names.middle_name,
    last_name: names.last_name,
    brand_ids: [brandIdFromClientCode(code)],
    contact_person: null,
    referred_by_first_name: null,
    referred_by_middle_name: null,
    referred_by_last_name: null,
    email: null,
    phone: null,
    country: null,
    city: null,
    address: null,
    payment_terms: null,
    client_reference_prefix: null,
    notes: `Restored from sales orders (${orphan.so_numbers.join(", ")}) — client profile was missing while orders still referenced this client.`,
    is_active: true,
    client_kind: "person",
  };
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function loadDocument(id) {
  const { data, error } = await supabase.from("erp_documents").select("data, updated_at").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

async function saveDocument(id, content) {
  const { error } = await supabase.from("erp_documents").upsert(
    { id, data: content, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) throw error;
}

async function main() {
  const clientsDoc = await loadDocument("clients");
  const salesDoc = await loadDocument("sales_orders");
  const clients = clientsDoc?.data?.clients ?? [];
  const orders = salesDoc?.data?.orders ?? [];

  const orphans = findOrphans(clients, orders);
  console.log(`Found ${orphans.length} orphan client id(s) across ${orders.length} sales orders.`);
  for (const orphan of orphans) {
    console.log(`  - ${orphan.client_id} ${orphan.client_code} "${orphan.client_name}" → ${orphan.so_numbers.join(", ")}`);
  }

  const usedCodes = new Set(clients.map((client) => client.code));
  const restored = [];
  for (const orphan of orphans) {
    if (usedCodes.has(orphan.client_code)) {
      console.warn(`  ! Skipping ${orphan.client_id}: code ${orphan.client_code} already used`);
      continue;
    }
    const profile = buildProfile(orphan);
    if (!profile) {
      console.warn(`  ! Skipping ${orphan.client_id}: missing client_code`);
      continue;
    }
    restored.push(profile);
    usedCodes.add(profile.code);
  }

  if (restored.length === 0) {
    console.log(DRY_RUN ? "Dry run: nothing to restore." : "Nothing to restore.");
    return;
  }

  const next = {
    ...(clientsDoc?.data ?? {}),
    updated_at: new Date().toISOString(),
    clients: [...clients, ...restored],
  };

  console.log(`Will restore ${restored.length} client profile(s):`);
  for (const profile of restored) {
    console.log(`  + ${profile.id} ${profile.code} ${profile.first_name} ${profile.middle_name ?? ""} ${profile.last_name}`.replace(/\s+/g, " "));
  }

  if (DRY_RUN) {
    console.log("Dry run only — no writes.");
    return;
  }

  await saveDocument("clients", next);

  const localPath = resolve(process.cwd(), "src/data/clients.json");
  writeFileSync(localPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`Wrote ${restored.length} restored client(s) to Supabase + ${localPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
