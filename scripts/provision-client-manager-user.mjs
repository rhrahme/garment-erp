#!/usr/bin/env node
/**
 * Create or update the QC client-manager login.
 *
 * Usage:
 *   node scripts/provision-client-manager-user.mjs
 *   node scripts/provision-client-manager-user.mjs --email hagan.qc@gmail.com --password 'your-password'
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
 *
 * Optional (to set profile role without manual SQL):
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

const email = readArg("--email", "hagan.qc@gmail.com").trim().toLowerCase();
const password = readArg("--password", "123456789");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or publishable/anon key in .env.local");
  process.exit(1);
}

async function setProfileRole(userId) {
  if (!serviceKey) {
    console.log("ℹ SUPABASE_SERVICE_ROLE_KEY not set — profile role left as default (viewer).");
    console.log("  Access is still enforced via CLIENT_MANAGER_EMAILS in .env.local.");
    return;
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.from("profiles").update({ role: "client_manager" }).eq("id", userId);
  if (error) {
    console.warn("Could not set profile role:", error.message);
    console.warn("Run migration 005_client_manager_role.sql, then retry or update profiles manually.");
    return;
  }
  console.log("✓ Profile role set to client_manager");
}

async function main() {
  const publicClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: signInData, error: signInError } = await publicClient.auth.signInWithPassword({ email, password });

  if (signInData.user) {
    console.log(`✓ User already exists — signed in as ${email}`);
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
    options: { data: { full_name: "QC Hossein" } },
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
    console.log(`✓ User created for ${email} — email confirmation may be required before first login.`);
  } else {
    console.log(`✓ User created and confirmed for ${email}`);
  }

  await setProfileRole(signUpData.user.id);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
