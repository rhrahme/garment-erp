import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

const SECRET_PATH = path.join(process.cwd(), "smtp-secret.local.json");

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

export interface SendEmailInput {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  from?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export function readSmtpPassword(): string | null {
  const fromEnv = process.env.SMTP_PASS?.trim();
  if (fromEnv) return fromEnv;

  try {
    if (!fs.existsSync(SECRET_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(SECRET_PATH, "utf8")) as { password?: string };
    const password = data.password?.trim();
    return password || null;
  } catch {
    return null;
  }
}

export function saveSmtpPassword(password: string): void {
  fs.writeFileSync(
    SECRET_PATH,
    `${JSON.stringify({ password: password.trim() }, null, 2)}\n`,
    "utf8"
  );
}

export function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = readSmtpPassword();
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host || !user || !pass || !from) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "true";

  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    user,
    pass,
    from,
    fromName: process.env.SMTP_FROM_NAME?.trim() || "Hagan Fabric Orders",
  };
}

export function isSmtpConfigured(): boolean {
  return getSmtpConfig() !== null;
}

function createTransport(config: SmtpConfig) {
  const options: SMTPTransport.Options = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  };

  return nodemailer.createTransport(options);
}

export async function verifySmtpConnection(): Promise<void> {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error("SMTP is not configured. Add SMTP settings to .env.local.");
  }

  const transport = createTransport(config);
  await transport.verify();
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const config = getSmtpConfig();
  if (!config) {
    throw new Error("SMTP is not configured. Add SMTP settings to .env.local.");
  }

  const recipients = [...new Set(input.to.map((value) => value.trim()).filter(Boolean))];
  if (recipients.length === 0) {
    throw new Error("At least one recipient email is required.");
  }

  const ccRecipients = [
    ...new Set((input.cc ?? []).map((value) => value.trim()).filter(Boolean)),
  ].filter((value) => !recipients.includes(value));

  const fromAddress = input.from?.trim() || config.from;
  const transport = createTransport(config);

  const info = await transport.sendMail({
    from: `"${config.fromName}" <${fromAddress}>`,
    to: recipients.join(", "),
    cc: ccRecipients.length > 0 ? ccRecipients.join(", ") : undefined,
    replyTo: input.replyTo?.trim() || fromAddress,
    subject: input.subject,
    text: input.text,
  });

  return {
    messageId: info.messageId,
    accepted: info.accepted.map(String),
    rejected: info.rejected.map(String),
  };
}

export function parseRecipientList(value: string): string[] {
  return [...new Set(value.split(/[\n,;]+/).map((part) => part.trim()).filter(Boolean))];
}
