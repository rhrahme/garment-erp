import path from "path";
import { readJsonFile, writeJsonFile } from "@/lib/data/json-file-cache";

const STORE_PATH = path.join(process.cwd(), "processed-emails.local.json");

interface ProcessedEmailStore {
  message_ids: string[];
}

function readStore(): ProcessedEmailStore {
  return readJsonFile(STORE_PATH, { message_ids: [] });
}

function writeStore(store: ProcessedEmailStore): void {
  writeJsonFile(STORE_PATH, store);
}

export function isEmailProcessed(messageId: string): boolean {
  const normalized = messageId.trim().toLowerCase();
  return readStore().message_ids.some((id) => id.toLowerCase() === normalized);
}

export function markEmailProcessed(messageId: string): void {
  const normalized = messageId.trim();
  if (!normalized || isEmailProcessed(normalized)) return;

  const store = readStore();
  store.message_ids.unshift(normalized);
  store.message_ids = store.message_ids.slice(0, 5000);
  writeStore(store);
}
