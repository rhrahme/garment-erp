#!/usr/bin/env node
/**
 * Persist the Custom / One-off supplier (id: "custom") into the Supabase
 * `supplier_contacts` erp_documents row so it is a real, present supplier — not
 * just a code-merged phantom. Resolves the admin "Missing suppliers: custom"
 * data-integrity warning and unblocks order saves that reference custom fabrics.
 *
 *   node scripts/add-custom-supplier-contact.mjs
 *   node scripts/add-custom-supplier-contact.mjs --dry-run
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Appends the custom row only — never overwrites existing suppliers.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CUSTOM_SUPPLIER_CONTACT = {
  id: "custom",
  code: "CUSTOM",
  name: "Custom / One-off",
  country: null,
  contact_person: null,
  emails: [],
  email: null,
  lead_time_days: 0,
  has_price_list: true,
  currency: "EUR",
  notes:
    "One-off fabrics (CF-YYYY-####) — mill leftovers, shop buys, client swatches. Created in Fabric Specification.",
};

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

loadEnvLocal();

const dryRun = process.argv.includes("--dry-run");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY in .env.local"
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: row, error: readError } = await admin
  .from("erp_documents")
  .select("data")
  .eq("id", "supplier_contacts")
  .maybeSingle();

if (readError) {
  console.error(`Supabase read failed: ${readError.message}`);
  process.exit(1);
}

if (!row?.data) {
  console.error("No supplier_contacts document found in Supabase — aborting to avoid clobbering.");
  process.exit(1);
}

const contacts = row.data;
const suppliers = Array.isArray(contacts.suppliers) ? contacts.suppliers : [];
const before = suppliers.length;

if (suppliers.some((s) => s.id === "custom")) {
  console.log(`custom supplier already present (${before} suppliers). Nothing to do.`);
  process.exit(0);
}

const updated = {
  ...contacts,
  suppliers: [...suppliers, CUSTOM_SUPPLIER_CONTACT],
  updated_at: new Date().toISOString(),
};

console.log(`Appending custom supplier: ${before} -> ${updated.suppliers.length} suppliers.`);

if (dryRun) {
  console.log("[dry-run] Would upsert supplier_contacts with custom row appended.");
  process.exit(0);
}

const { error: writeError } = await admin.from("erp_documents").upsert(
  { id: "supplier_contacts", data: updated, updated_at: updated.updated_at },
  { onConflict: "id" }
);

if (writeError) {
  console.error(`Supabase write failed: ${writeError.message}`);
  process.exit(1);
}

console.log("Done. custom supplier persisted to Supabase supplier_contacts.");
