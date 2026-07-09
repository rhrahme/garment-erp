import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const JSON_PATH = path.join(process.cwd(), "src/data/customer-invoices.json");

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function syncCustomerInvoices(data) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !serviceKey) throw new Error("Missing Supabase credentials in .env.local");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.from("erp_documents").upsert(
    { id: "customer_invoices", data, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) throw new Error(`customer_invoices: ${error.message}`);
  console.log("\u2713 synced customer_invoices to Supabase");
}

function pieceNamesFromInvoicePieceField(pieceName) {
  if (!pieceName?.trim()) return [];
  if (pieceName.includes(" + ")) return pieceName.split(" + ").map((n) => n.trim());
  return [pieceName.trim()];
}

function fixedComboDescription(garmentType, pieceNames) {
  const joinedPieces = pieceNames.join(" + ");
  if (garmentType.replace(/\s*\+\s*/g, "+") === pieceNames.join("+")) return joinedPieces;
  return `${garmentType} (${joinedPieces})`;
}

const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
const invoices = data.invoices ?? [];
const affected = [];
let fixedCount = 0;

for (const inv of invoices) {
  for (const line of inv.lines ?? []) {
    const pieceNames = pieceNamesFromInvoicePieceField(line.piece_name);
    if (pieceNames.length <= 1) continue;
    const next = fixedComboDescription(line.garment_type, pieceNames);
    if (next !== line.description) {
      affected.push({
        invoice: inv.invoice_number,
        id: line.id,
        from: line.description,
        to: next,
      });
      line.description = next;
      fixedCount += 1;
    }
  }
}

if (fixedCount > 0) {
  data.updated_at = new Date().toISOString();
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + "\n");
}

console.log(`Fixed ${fixedCount} invoice line(s) across ${new Set(affected.map((a) => a.invoice)).size} invoice(s).`);
for (const a of affected) {
  console.log(`  ${a.invoice} ${a.id}: "${a.from}" -> "${a.to}"`);
}

if (process.argv.includes("--sync")) {
  await syncCustomerInvoices(data);
} else {
  console.log("\nRun with --sync to push customer_invoices to Supabase.");
}
