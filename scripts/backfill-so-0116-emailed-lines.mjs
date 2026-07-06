#!/usr/bin/env node
/**
 * Backfill line.emailed_at on PO-2026-0015 after a partial supplier email send.
 *
 * Use when the Jul 3 partial send was emailed via SMTP but markers were lost
 * (PO missing from Supabase, then recovered without emailed_at).
 *
 *   node scripts/backfill-so-0116-emailed-lines.mjs --fabrics S10005,S10006,S10008
 *   node scripts/backfill-so-0116-emailed-lines.mjs --line-ids po-1783030651405-g1ekcn-line-1,po-1783030651405-g1ekcn-line-2
 *   node scripts/backfill-so-0116-emailed-lines.mjs --fabrics S10005 --emailed-at 2026-07-02T22:22:00.000Z --email-to orders@loropiana.it
 *   node scripts/backfill-so-0116-emailed-lines.mjs --dry-run --fabrics S10005
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PO_ID = "po-1783030651405-g1ekcn";
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

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return [];
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const fabricNumbers = new Set(readArg("--fabrics").map((value) => value.toUpperCase()));
const lineIds = new Set(readArg("--line-ids"));
const emailedAt = readArg("--emailed-at")[0] ?? "2026-07-02T22:22:00.000Z";
const emailTo =
  readArg("--email-to")[0] ?? "orders@loropiana.it, fabricorders@loropiana.it";

if (fabricNumbers.size === 0 && lineIds.size === 0) {
  console.error("Provide --fabrics S10005,S10006 or --line-ids po-...-line-1,...");
  process.exit(1);
}

async function main() {
  const { data, error } = await supabase
    .from("erp_documents")
    .select("data")
    .eq("id", "fabric_orders")
    .maybeSingle();
  if (error) throw error;

  const store = data?.data ?? { orders: [] };
  const po = store.orders?.find((order) => order.id === PO_ID);
  if (!po) {
    console.error(`PO ${PO_ID} not found`);
    process.exit(1);
  }

  const matched = [];
  for (const line of po.lines ?? []) {
    const byId = lineIds.has(line.id);
    const byFabric = fabricNumbers.has((line.fabric_number ?? "").toUpperCase());
    if (!byId && !byFabric) continue;
    if (line.emailed_at) {
      console.warn(`Skip ${line.id} ${line.fabric_number} — already emailed at ${line.emailed_at}`);
      continue;
    }
    line.emailed_at = emailedAt;
    matched.push(line);
  }

  if (matched.length === 0) {
    console.error("No lines matched — check fabric numbers / line ids.");
    process.exit(1);
  }

  const allSent = (po.lines ?? []).every((line) => Boolean(line.emailed_at));
  if (allSent) {
    po.emailed_at = emailedAt;
    po.email_to = emailTo;
    po.status = "sent";
  } else {
    po.emailed_at = null;
    po.status = po.status === "sent" ? "draft" : po.status;
  }

  console.log(
    JSON.stringify(
      {
        dry_run: DRY_RUN,
        po_number: po.po_number,
        emailed_at: emailedAt,
        matched_count: matched.length,
        pending_count: (po.lines?.length ?? 0) - (po.lines?.filter((line) => line.emailed_at).length ?? 0),
        po_fully_sent: allSent,
        matched: matched.map((line) => ({
          id: line.id,
          fabric_number: line.fabric_number,
          garment_type: line.garment_type,
        })),
      },
      null,
      2
    )
  );

  if (DRY_RUN) return;

  const { error: saveError } = await supabase.from("erp_documents").upsert(
    {
      id: "fabric_orders",
      data: store,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (saveError) throw saveError;
  console.log(`Saved ${matched.length} line emailed_at marker(s) on ${po.po_number}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
