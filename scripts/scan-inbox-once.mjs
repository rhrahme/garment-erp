/**
 * Run inbox scan from the command line (supplier + transporter emails).
 * Usage: node scripts/scan-inbox-once.mjs [days]
 */
import fs from "fs";
import path from "path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();

function loadEnvFile(filename) {
  const filePath = path.join(ROOT, filename);
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
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
    if (process.env[key] == null) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const imapSecretPath = path.join(ROOT, "imap-secret.local.json");
if (!process.env.IMAP_PASS && fs.existsSync(imapSecretPath)) {
  const data = JSON.parse(fs.readFileSync(imapSecretPath, "utf8"));
  if (data.password) process.env.IMAP_PASS = data.password;
}

const contactsPath = path.join(ROOT, "src/data/suppliers/contacts.json");
if (!process.env.IMAP_USER && fs.existsSync(contactsPath)) {
  const contacts = JSON.parse(fs.readFileSync(contactsPath, "utf8"));
  if (contacts.inbox_scan_email) process.env.IMAP_USER = contacts.inbox_scan_email;
}

const days = Number.parseInt(process.argv[2] ?? "14", 10);

register("./scripts/tsconfig-paths-loader.mjs", pathToFileURL("./"));

const { scanSupplierInbox } = await import("../src/lib/email/inbound/scan-inbox.ts");
const { relinkTransporterInvoicesByAwb } = await import(
  "../src/lib/integrations/transporter-invoice-store.ts"
);

console.log(`Scanning ${process.env.IMAP_USER ?? "?"} (last ${days} days)…`);

const result = await scanSupplierInbox({ days, limit: 400 });
relinkTransporterInvoicesByAwb();

console.log(JSON.stringify(result, null, 2));
