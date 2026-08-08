#!/usr/bin/env node
/**
 * Relabel client patterns whose filled cells are inches but unit says "cm".
 * Does NOT convert numbers - only fixes the unit label so cm display converts.
 *
 * Usage:
 *   node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs \
 *     scripts/relabel-inch-client-patterns.mjs
 *   node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs \
 *     scripts/relabel-inch-client-patterns.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyRestoreStoredInches } from "../src/lib/pattern-library/heal-measurement-unit.ts";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function nowIso() {
  return new Date().toISOString();
}

async function fetchDoc(admin, id) {
  const { data, error } = await admin.from("erp_documents").select("data").eq("id", id).single();
  if (error) throw new Error(`Fetch ${id}: ${error.message}`);
  return data.data;
}

async function syncDoc(admin, id, data, localPath) {
  const updated_at = nowIso();
  const payload = { ...data, updated_at };
  const { error } = await admin
    .from("erp_documents")
    .upsert({ id, data: payload, updated_at }, { onConflict: "id" });
  if (error) throw new Error(`Supabase upsert ${id} failed: ${error.message}`);
  if (localPath) writeFileSync(localPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

async function main() {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const library = await fetchDoc(admin, "pattern_library");
  const changed = [];

  library.client_patterns = (library.client_patterns ?? []).map((pattern) => {
    const next = applyRestoreStoredInches(pattern);
    if (!next) return pattern;
    changed.push({
      id: pattern.id,
      pattern_ref: pattern.pattern_ref,
      client_name: pattern.client_name,
      from_unit: pattern.unit,
      to_unit: next.unit,
    });
    return next;
  });

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        scanned: (library.client_patterns ?? []).length,
        relabeled: changed.length,
        sample: changed.slice(0, 20),
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write Supabase + local JSON.");
    return;
  }

  if (changed.length === 0) {
    console.log("Nothing to write.");
    return;
  }

  await syncDoc(
    admin,
    "pattern_library",
    library,
    resolve(process.cwd(), "src/data/pattern-library.json")
  );
  console.log(
    `Restored ${changed.length} client patterns to stored inches (relabel or convert-back).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
