#!/usr/bin/env node
/**
 * One-time seed: upload fabric-order-drafts.local.json to Supabase erp_documents.
 *
 * Production (Vercel) reads fabric order drafts from Supabase, not the git-tracked
 * JSON file. Use this after adding or editing fabric-order-drafts.local.json locally.
 *
 * Prerequisites:
 *   - SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage:
 *   node scripts/seed-fabric-order-draft.mjs
 *   node scripts/seed-fabric-order-draft.mjs --dry-run
 *   node scripts/seed-fabric-order-draft.mjs --user info@hagan.pro
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DRAFT_FILE = "fabric-order-drafts.local.json";
const DOCUMENT_ID = "fabric_order_drafts";
const FALLBACK = { updated_at: null, drafts: {} };

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

function readLocalDrafts() {
  const fullPath = resolve(process.cwd(), DRAFT_FILE);
  if (!existsSync(fullPath)) {
    console.error(`Missing ${DRAFT_FILE} — create the draft locally first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function draftKey(email) {
  return email.trim().toLowerCase();
}

function countLinesForUser(file, email) {
  const entry = file.drafts?.[draftKey(email)];
  const clientDrafts = entry?.draft?.clientDrafts ?? [];
  return clientDrafts.reduce((sum, cd) => sum + (cd.lines?.length ?? 0), 0);
}

function mergeDraftFiles(remote, incoming, onlyUser) {
  const merged = {
    updated_at: incoming.updated_at ?? remote.updated_at ?? null,
    drafts: { ...(remote.drafts ?? {}) },
  };

  const users = onlyUser
    ? [draftKey(onlyUser)]
    : Object.keys(incoming.drafts ?? {});

  for (const user of users) {
    const next = incoming.drafts?.[user];
    if (next) merged.drafts[user] = next;
  }

  merged.updated_at = new Date().toISOString();
  return merged;
}

loadEnvLocal();

const dryRun = process.argv.includes("--dry-run");
const userArgIdx = process.argv.indexOf("--user");
const onlyUser = userArgIdx >= 0 ? process.argv[userArgIdx + 1] : null;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY in .env.local"
  );
  process.exit(1);
}

const incoming = readLocalDrafts();
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: remoteRow, error: readError } = await admin
  .from("erp_documents")
  .select("data")
  .eq("id", DOCUMENT_ID)
  .maybeSingle();

if (readError) {
  console.error(`Cannot read ${DOCUMENT_ID}:`, readError.message);
  process.exit(1);
}

const remote = remoteRow?.data ?? FALLBACK;
const merged = mergeDraftFiles(remote, incoming, onlyUser);

const users = onlyUser ? [draftKey(onlyUser)] : Object.keys(incoming.drafts ?? {});
for (const user of users) {
  const lines = countLinesForUser(merged, user);
  console.log(`  ${user}: ${lines} fabric line(s)`);
}

if (dryRun) {
  console.log("\nDry run — no data written.");
  process.exit(0);
}

const updated_at = new Date().toISOString();
const { error: writeError } = await admin.from("erp_documents").upsert(
  { id: DOCUMENT_ID, data: merged, updated_at },
  { onConflict: "id" }
);

if (writeError) {
  console.error(`Upload failed: ${writeError.message}`);
  process.exit(1);
}

console.log(`\n✓ Seeded ${DOCUMENT_ID} to Supabase (${users.length} user draft(s)).`);
