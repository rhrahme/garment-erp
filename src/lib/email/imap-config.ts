import { getInboxScanEmail, readImapPassword } from "@/lib/email/imap-auth";

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export function getImapConfig(): ImapConfig | null {
  const user = getInboxScanEmail();
  const pass = readImapPassword();
  const host = process.env.IMAP_HOST?.trim() || "imap.gmail.com";
  const port = Number(process.env.IMAP_PORT ?? 993);
  const secure = process.env.IMAP_SECURE !== "false";

  if (!user || !pass) {
    return null;
  }

  return {
    host,
    port: Number.isFinite(port) ? port : 993,
    secure,
    user,
    pass,
  };
}

export function isImapConfigured(): boolean {
  return getImapConfig() !== null;
}
