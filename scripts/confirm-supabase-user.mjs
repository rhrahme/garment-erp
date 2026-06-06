#!/usr/bin/env node
/**
 * Confirm a Supabase auth user (bypass email confirmation).
 * Requires SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY in .env.local
 *
 * Usage:
 *   node scripts/confirm-supabase-user.mjs hagan.qc@gmail.com
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
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

const email = (process.argv[2] ?? "hagan.qc@gmail.com").trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
  process.env.SUPABASE_SECRET_KEY?.trim();

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY in .env.local"
  );
  console.error("Get the secret key from Supabase → Project Settings → API → secret key");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error("Failed to list users:", listError.message);
  process.exit(1);
}

const user = list.users.find((row) => row.email?.toLowerCase() === email);
if (!user) {
  console.error(`No user found for ${email}`);
  process.exit(1);
}

if (user.email_confirmed_at) {
  console.log(`✓ ${email} is already confirmed`);
  process.exit(0);
}

const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
if (updateError) {
  console.error("Failed to confirm user:", updateError.message);
  process.exit(1);
}

console.log(`✓ Confirmed ${email} (${user.id})`);
