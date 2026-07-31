#!/usr/bin/env node
/**
 * Create or update a sales operator login.
 *
 * Usage:
 *   node scripts/provision-sales-user.mjs
 *   node scripts/provision-sales-user.mjs --email sales1@hagan.pro --password 'your-password'
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Access is granted via profiles.role = sales_operator and/or SALES_EMAILS
 * (sales1@hagan.pro is also a builtin in permissions.ts).
 * Never commit passwords.
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

const email = readArg("--email", "sales1@hagan.pro").trim().toLowerCase();
const password = readArg("--password", "");
const fullName = readArg("--name", "Sales 1");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

if (!password) {
  console.error("Pass --password on the command line (never commit passwords to git).");
  process.exit(1);
}

async function findUserByEmail(admin) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").trim().toLowerCase() === email);
    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function setProfileRole(admin, userId) {
  const { error } = await admin
    .from("profiles")
    .upsert({ id: userId, role: "sales_operator", full_name: fullName }, { onConflict: "id" });
  if (error) {
    console.warn("Could not set profile role:", error.message);
    console.warn(
      "Access still works via SALES_EMAILS / builtin sales1@hagan.pro (profiles may be unavailable in PostgREST)."
    );
    return false;
  }
  console.log("OK Profile role set to sales_operator");
  return true;
}

async function verifyPassword() {
  if (!anonKey) {
    console.log("INFO No anon/publishable key - skipping password sign-in verify.");
    return;
  }
  const publicClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await publicClient.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    console.warn("WARN Password sign-in verify failed:", error?.message ?? "no user");
    return;
  }
  console.log("OK Password sign-in verified");
  await publicClient.auth.signOut();
}

async function main() {
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const existing = await findUserByEmail(admin);
  let userId;
  let action;

  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(existing.user_metadata ?? {}), full_name: fullName },
    });
    if (error) {
      console.error("Password reset failed:", error.message);
      process.exit(1);
    }
    userId = data.user.id;
    action = "password_reset";
    console.log(`OK Existing user updated (password reset) for ${email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) {
      console.error("Create user failed:", error.message);
      process.exit(1);
    }
    userId = data.user.id;
    action = "created";
    console.log(`OK User created for ${email}`);
  }

  await setProfileRole(admin, userId);
  await verifyPassword();

  const salesEmails = (process.env.SALES_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (salesEmails.includes(email)) {
    console.log("OK Email already listed in local SALES_EMAILS");
  } else {
    console.log("INFO Add to SALES_EMAILS (local + Vercel) for email-based access fallback:");
    console.log(`  SALES_EMAILS=${email}`);
  }

  console.log(`ACTION=${action}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
