/**
 * Clear stitch floor state for a clean floor test.
 * Same mutations as POST /api/production/sewing-session/reset-testing.
 *
 * Usage:
 *   node scripts/run-sewing-session-reset.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOCS = {
  sewing_sessions: {
    key: "sewing_sessions",
    path: "src/data/sewing-sessions.json",
    fallback: {
      updated_at: null,
      kiosk_arms: [],
      kiosk_piece_arms: [],
      sessions: [],
    },
  },
  sewing_scan_failures: {
    key: "sewing_scan_failures",
    path: "src/data/sewing-scan-failures.json",
    fallback: { updated_at: null, failures: [] },
  },
  pattern_alteration_pending: {
    key: "pattern_alteration_pending",
    path: "src/data/pattern-alteration-pending.json",
    fallback: { updated_at: null, items: [] },
  },
};

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

function readLocal(spec) {
  const fullPath = resolve(process.cwd(), spec.path);
  if (!existsSync(fullPath)) return structuredClone(spec.fallback);
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function writeLocal(spec, data) {
  const fullPath = resolve(process.cwd(), spec.path);
  writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readDoc(admin, spec) {
  if (!admin) return readLocal(spec);
  const { data, error } = await admin
    .from("erp_documents")
    .select("data")
    .eq("id", spec.key)
    .maybeSingle();
  if (error) throw new Error(`Supabase read ${spec.key}: ${error.message}`);
  if (data?.data) return data.data;
  return readLocal(spec);
}

async function writeDoc(admin, spec, payload) {
  const next = { ...payload, updated_at: new Date().toISOString() };
  if (admin) {
    const { error } = await admin
      .from("erp_documents")
      .upsert({ id: spec.key, data: next, updated_at: next.updated_at }, { onConflict: "id" });
    if (error) throw new Error(`Supabase write ${spec.key}: ${error.message}`);
  }
  writeLocal(spec, next);
  return next;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const admin =
    url && serviceKey
      ? createClient(url, serviceKey, { auth: { persistSession: false } })
      : null;

  if (!admin) {
    console.warn("No Supabase admin env — writing local JSON only.");
  }

  const previous = await readDoc(admin, DOCS.sewing_sessions);
  const failures = await readDoc(admin, DOCS.sewing_scan_failures);
  const pending = await readDoc(admin, DOCS.pattern_alteration_pending);

  const openSessions = (previous.sessions ?? []).filter(
    (session) => session.status === "open" || session.status === "closing"
  );
  const closedSessions = (previous.sessions ?? []).filter(
    (session) => session.status === "closed"
  );
  const outstandingPending = (pending.items ?? []).filter(
    (item) => item.status === "pending" || item.status === "acknowledged"
  );

  await writeDoc(admin, DOCS.sewing_sessions, {
    updated_at: null,
    kiosk_arms: [],
    kiosk_piece_arms: [],
    sessions: [],
  });

  await writeDoc(admin, DOCS.sewing_scan_failures, {
    updated_at: null,
    failures: [],
  });

  if (outstandingPending.length > 0) {
    const at = new Date().toISOString();
    const by = "sewing-testing-reset";
    const nextItems = (pending.items ?? []).map((item) => {
      if (item.status !== "pending" && item.status !== "acknowledged") return item;
      return {
        ...item,
        status: "chart_updated",
        chart_updated_at: at,
        chart_updated_by: by,
        acknowledged_at: item.acknowledged_at ?? at,
        acknowledged_by: item.acknowledged_by ?? by,
      };
    });
    await writeDoc(admin, DOCS.pattern_alteration_pending, {
      ...pending,
      items: nextItems,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        target: admin ? "supabase+local" : "local-only",
        cleared_arms: (previous.kiosk_arms ?? []).length,
        cleared_piece_arms: (previous.kiosk_piece_arms ?? []).length,
        cleared_open_sessions: openSessions.length,
        cleared_closed_sessions: closedSessions.length,
        cleared_failures: (failures.failures ?? []).length,
        cleared_alteration_pending: outstandingPending.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
