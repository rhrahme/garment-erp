import path from "path";
import {
  readJsonFile,
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
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

/** Forced Supabase read for every kiosk RMW — never mutate from a stale cache. */
export async function readSewingSessionsFresh(): Promise<SewingSessionsFile> {
  return readJsonFileFreshAsync(STORE_PATH, EMPTY, { force: true });
}

export async function writeSewingSessions(
  store: SewingSessionsFile,
  options: { allowTestingReset?: boolean; allowSessionDeleteIds?: string[] } = {}
): Promise<SewingSessionsFile> {
  const deleteIds = (options.allowSessionDeleteIds ?? []).filter((id) => Boolean(id.trim()));
  const next = {
    ...store,
    updated_at: new Date().toISOString(),
    ...(options.allowTestingReset ? { allow_testing_reset: true } : {}),
    ...(deleteIds.length > 0 ? { allow_session_delete_ids: deleteIds } : {}),
  };
  await saveDocument(STORE_PATH, next);
  const {
    allow_testing_reset: _flag,
    allow_session_delete_ids: _deleteIds,
    ...clean
  } = next as SewingSessionsFile & {
    allow_testing_reset?: boolean;
    allow_session_delete_ids?: string[];
  };
  return clean;
}
