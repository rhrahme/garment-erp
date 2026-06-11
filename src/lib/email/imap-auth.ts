import fs from "fs";
import path from "path";

const SECRET_PATH = path.join(process.cwd(), "imap-secret.local.json");

export function readImapPassword(): string | null {
  const fromEnv = process.env.IMAP_PASS?.trim();
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

export function saveImapPassword(password: string): void {
  fs.writeFileSync(
    SECRET_PATH,
    `${JSON.stringify({ password: password.trim() }, null, 2)}\n`,
    "utf8"
  );
}

export function getInboxScanEmail(): string | null {
  return process.env.IMAP_USER?.trim() || null;
}
