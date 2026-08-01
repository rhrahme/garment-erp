import path from "path";
import { readJsonFile, readJsonFileAsync, saveDocument } from "@/lib/data/document-persistence";
import type { SewingSessionsFile } from "@/lib/types/sewing-sessions";

const STORE_PATH = path.join(process.cwd(), "src/data/sewing-sessions.json");
const EMPTY: SewingSessionsFile = {
  updated_at: null,
  kiosk_arms: [],
  kiosk_piece_arms: [],
  sessions: [],
};

export function readSewingSessions(): SewingSessionsFile {
  return readJsonFile(STORE_PATH, EMPTY);
}

export async function readSewingSessionsAsync(): Promise<SewingSessionsFile> {
  return readJsonFileAsync(STORE_PATH, EMPTY);
}

export async function writeSewingSessions(store: SewingSessionsFile): Promise<SewingSessionsFile> {
  const next = {
    ...store,
    updated_at: new Date().toISOString(),
  };
  await saveDocument(STORE_PATH, next);
  return next;
}
