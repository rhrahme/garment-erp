#!/usr/bin/env node
/**
 * Create or update the accounting login.
 *
 * Usage:
 *   node scripts/provision-accounting-user.mjs
 *   node scripts/provision-accounting-user.mjs --email accounting@hagan.pro --password 'your-password'
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
 *
 * Optional (to set profile role + confirm email without manual SQL):
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  try {
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
  } catch {
    /* optional */
  }
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

loadEnvLocal();

const email = readArg("--email", "accounting@hagan.pro").trim().toLowerCase();
const password = readArg("--password", "");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or publishable/anon key in .env.local");
  process.exit(1);
}

if (!password) {
  console.error("Pass --password on the command line (never commit passwords to git).");
  process.exit(1);
}

async function confirmUser(userId) {
  if (!serviceKey) return false;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
  if (error) {
    console.warn("Could not confirm email:", error.message);
    return false;
  }
  console.log("✓ Email confirmed");
  return true;
}

async function setProfileRole(userId) {
  if (!serviceKey) {
    console.log("ℹ SUPABASE_SERVICE_ROLE_KEY not set — profile role left as default (viewer).");
    console.log("  Access is still enforced via ACCOUNTING_EMAILS in .env.local.");
    return;
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.from("profiles").update({ role: "accounting" }).eq("id", userId);
  if (error) {
    console.warn("Could not set profile role:", error.message);
    console.warn("Run migration 016_accounting_operator_role.sql, then retry or update profiles manually.");
    return;
  }
  console.log("✓ Profile role set to accounting");
}

async function main() {
  const publicClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: signInData, error: signInError } = await publicClient.auth.signInWithPassword({ email, password });

  if (signInData.user) {
    console.log(`✓ User already exists — signed in as ${email}`);
    await confirmUser(signInData.user.id);
    await setProfileRole(signInData.user.id);
    return;
  }

  if (signInError && !/invalid login credentials/i.test(signInError.message)) {
    console.error("Sign-in check failed:", signInError.message);
    process.exit(1);
  }

  const { data: signUpData, error: signUpError } = await publicClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: "Accounting" } },
  });

  if (signUpError) {
    console.error("Sign-up failed:", signUpError.message);
    process.exit(1);
  }

  if (!signUpData.user) {
    console.error("Sign-up returned no user — check Supabase auth settings.");
    process.exit(1);
  }

  if (!signUpData.session) {
    console.log(`✓ User created for ${email} — confirming email…`);
    await confirmUser(signUpData.user.id);
  } else {
    console.log(`✓ User created and confirmed for ${email}`);
  }

  await setProfileRole(signUpData.user.id);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
