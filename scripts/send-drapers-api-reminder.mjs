/**
 * Send Drapers API integration follow-up reminder email.
 * Usage: node scripts/send-drapers-api-reminder.mjs
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import nodemailer from "nodemailer";

const ROOT = process.cwd();
const REMINDER_PATH = path.join(ROOT, "drapers-api-reminder.local.json");

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

let reminder = null;
if (fs.existsSync(REMINDER_PATH)) {
  reminder = JSON.parse(fs.readFileSync(REMINDER_PATH, "utf8"));
}

const requestedOn = reminder?.requested_on ?? "2026-05-29";
const followUpOn = reminder?.follow_up_on ?? new Date().toISOString().slice(0, 10);
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
const mode = process.argv.includes("--confirm-scheduled") ? "confirm" : "reminder";

const text =
  mode === "confirm"
    ? [
        "Garment ERP — Drapers API integration reminder scheduled",
        "",
        "A follow-up email reminder has been scheduled for:",
        `  ${followUpOn} at 9:00 AM (local time)`,
        "",
        `You requested Drapers API integration on ${requestedOn}.`,
        "",
        "On that date you'll receive a reminder to follow up with:",
        "- Jessica: jessica@drapersitaly.it",
        "- Federico: federico@drapersitaly.it",
        "",
        "Topics: API docs, credentials, live stock + order status integration.",
        "",
        `Open ERP: ${appUrl}`,
      ].join("\n")
    : [
        "Garment ERP — Drapers API integration follow-up",
        "",
        `Reminder: follow up with Drapers on API integration.`,
        "",
        `Requested on: ${requestedOn}`,
        `Follow-up due: ${followUpOn}`,
        "",
        "Suggested actions:",
        "- Email Jessica / Federico at Drapers (jessica@drapersitaly.it, federico@drapersitaly.it)",
        "- Ask for API docs, credentials, and timeline for live stock + order status",
        "- Once available, wire into Garment ERP to replace PDF stock updates",
        "",
        `Open ERP: ${appUrl}`,
        "",
        "This is an automated reminder from Garment ERP.",
      ].join("\n");

const subject =
  mode === "confirm"
    ? "Scheduled: Drapers API integration follow-up (7 days)"
    : "Reminder: Follow up with Drapers on API integration";

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
  subject,
  text,
});

if (mode === "reminder") {
  const launchAgent = path.join(
    process.env.HOME ?? "",
    "Library/LaunchAgents/com.hagan.garment-erp.drapers-api-reminder.plist"
  );
  if (launchAgent && fs.existsSync(launchAgent)) {
    try {
      execSync(`launchctl bootout gui/${process.getuid()} "${launchAgent}"`, {
        stdio: "ignore",
      });
      fs.unlinkSync(launchAgent);
    } catch {
      // best-effort cleanup after one-shot send
    }
  }
}

if (reminder) {
  const patch =
    mode === "confirm"
      ? { confirmation_sent_at: new Date().toISOString() }
      : { sent_at: new Date().toISOString() };
  fs.writeFileSync(
    REMINDER_PATH,
    `${JSON.stringify({ ...reminder, ...patch }, null, 2)}\n`
  );
}

console.log(
  mode === "confirm"
    ? "✓ Drapers API reminder schedule confirmation sent"
    : "✓ Drapers API follow-up reminder sent"
);
console.log("  To:", recipients.join(", "));
console.log("  Message ID:", info.messageId);
