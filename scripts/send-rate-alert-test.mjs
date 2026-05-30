/**
 * Send a test EUR/SAR rate alert email (bypasses app login).
 * Usage: node scripts/send-rate-alert-test.mjs
 */
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

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

function readSmtpPassword() {
  const fromEnv = process.env.SMTP_PASS?.trim();
  if (fromEnv) return fromEnv;
  const secretPath = path.join(ROOT, "smtp-secret.local.json");
  if (!fs.existsSync(secretPath)) return null;
  const data = JSON.parse(fs.readFileSync(secretPath, "utf8"));
  return data.password?.trim() || null;
}

const EUR_TO_SAR = Number.parseFloat(process.env.EUR_TO_SAR ?? "4.5") || 4.5;
const EUR_SAR_ALERT_THRESHOLD =
  Number.parseFloat(process.env.EUR_SAR_ALERT_THRESHOLD ?? "4.5") || 4.5;

const recipients = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);

if (recipients.length === 0) {
  console.error("No SUPER_ADMIN_EMAILS in .env.local");
  process.exit(1);
}

const host = process.env.SMTP_HOST?.trim();
const user = process.env.SMTP_USER?.trim();
const pass = readSmtpPassword();
const from = process.env.SMTP_FROM?.trim() || user;
const fromName = process.env.SMTP_FROM_NAME?.trim() || "Hagan Fabric Orders";
const port = Number(process.env.SMTP_PORT ?? 587);
const secure = process.env.SMTP_SECURE === "true";

if (!host || !user || !pass || !from) {
  console.error("SMTP not configured — check SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local");
  process.exit(1);
}

let marketRate = null;
try {
  const response = await fetch("https://open.er-api.com/v6/latest/EUR");
  const data = await response.json();
  marketRate = data.rates?.SAR ?? null;
} catch (error) {
  console.warn("Could not fetch live rate:", error.message);
}

const aboveThreshold = marketRate != null && marketRate > EUR_SAR_ALERT_THRESHOLD;
const text = [
  "Garment ERP — TEST exchange rate alert",
  "",
  "This is a test email to confirm rate alerts are working.",
  "",
  `Live EUR → SAR: ${marketRate != null ? marketRate.toFixed(4) : "unavailable"}`,
  `Alert threshold: ${EUR_SAR_ALERT_THRESHOLD.toFixed(2)}`,
  `Book rate used for SAR prices: ${EUR_TO_SAR.toFixed(2)}`,
  `Above threshold: ${aboveThreshold ? "YES — real alerts would fire" : "NO — market is below threshold"}`,
  "",
  "When the live rate goes above the threshold, you will receive a real alert (max once per 24h).",
].join("\n");

const transport = nodemailer.createTransport({
  host,
  port: Number.isFinite(port) ? port : 587,
  secure,
  auth: { user, pass },
});

const info = await transport.sendMail({
  from: `"${fromName}" <${from}>`,
  to: recipients.join(", "),
  replyTo: from,
  subject: `[TEST] Garment ERP EUR/SAR rate check — ${marketRate?.toFixed(2) ?? "unavailable"}`,
  text,
});

console.log("✓ Test rate alert sent");
console.log("  To:", recipients.join(", "));
console.log("  From:", from);
console.log("  Message ID:", info.messageId);
console.log("  Live EUR/SAR:", marketRate?.toFixed(4) ?? "n/a");
console.log("  Above threshold (4.50):", aboveThreshold ? "yes" : "no");
