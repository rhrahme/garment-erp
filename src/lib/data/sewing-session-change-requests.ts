import path from "path";
import {
  readJsonFile,
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import type {
  SewingSessionChangeRequest,
  SewingSessionChangeRequestsFile,
} from "@/lib/types/sewing-session-change-requests";

const STORE_PATH = path.join(process.cwd(), "src/data/sewing-session-change-requests.json");
const EMPTY: SewingSessionChangeRequestsFile = { updated_at: null, requests: [] };

export function readSewingSessionChangeRequests(): SewingSessionChangeRequestsFile {
  return readJsonFile(STORE_PATH, EMPTY);
}

export async function readSewingSessionChangeRequestsAsync(): Promise<SewingSessionChangeRequestsFile> {
  return readJsonFileAsync(STORE_PATH, EMPTY);
}

export async function readSewingSessionChangeRequestsFresh(): Promise<SewingSessionChangeRequestsFile> {
  return readJsonFileFreshAsync(STORE_PATH, EMPTY, { force: true });
}

export async function writeSewingSessionChangeRequests(
  store: SewingSessionChangeRequestsFile
): Promise<SewingSessionChangeRequestsFile> {
  const next: SewingSessionChangeRequestsFile = {
    ...store,
    updated_at: new Date().toISOString(),
  };
  await saveDocument(STORE_PATH, next);
  return next;
}

export function listPendingSewingSessionChangeRequests(
  store: SewingSessionChangeRequestsFile = readSewingSessionChangeRequests()
): SewingSessionChangeRequest[] {
  return (store.requests ?? []).filter((row) => row.status === "pending");
}

export function countPendingSewingSessionChangeRequests(): number {
  return listPendingSewingSessionChangeRequests().length;
}
