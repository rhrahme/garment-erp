import path from "path";
import { readJsonFileAsync, writeJsonFileAsync } from "@/lib/data/document-persistence";
import {
  isSalesOrderDraftEmpty,
  migrateSalesOrderDraft,
  type SalesOrderFormDraft,
} from "@/lib/autosave/sales-order-draft";

const FILE_PATH = path.join(process.cwd(), "fabric-order-drafts.local.json");

export type StoredFabricOrderDraft = {
  saved_at: string;
  saved_by: string;
  draft: SalesOrderFormDraft;
};

export type FabricOrderDraftsFile = {
  updated_at: string | null;
  drafts: Record<string, StoredFabricOrderDraft>;
};

const FALLBACK: FabricOrderDraftsFile = { updated_at: null, drafts: {} };

function draftKeyForUser(userEmail: string): string {
  return userEmail.trim().toLowerCase();
}

export async function readFabricOrderDraftsFile(): Promise<FabricOrderDraftsFile> {
  return readJsonFileAsync(FILE_PATH, FALLBACK);
}

export async function getServerFabricOrderDraft(
  userEmail: string
): Promise<StoredFabricOrderDraft | null> {
  const file = await readFabricOrderDraftsFile();
  const entry = file.drafts[draftKeyForUser(userEmail)];
  if (!entry) return null;

  const draft = migrateSalesOrderDraft(entry.draft);
  if (!draft || isSalesOrderDraftEmpty(draft)) return null;

  return { ...entry, draft };
}

export async function saveServerFabricOrderDraft(
  userEmail: string,
  draft: SalesOrderFormDraft
): Promise<StoredFabricOrderDraft | null> {
  if (isSalesOrderDraftEmpty(draft)) {
    await clearServerFabricOrderDraft(userEmail);
    return null;
  }

  const file = await readFabricOrderDraftsFile();
  const key = draftKeyForUser(userEmail);
  const now = new Date().toISOString();
  const stored: StoredFabricOrderDraft = {
    saved_at: now,
    saved_by: userEmail,
    draft: { ...draft, savedAt: now },
  };

  file.drafts[key] = stored;
  file.updated_at = now;
  await writeJsonFileAsync(FILE_PATH, file);
  return stored;
}

export async function clearServerFabricOrderDraft(userEmail: string): Promise<void> {
  const file = await readFabricOrderDraftsFile();
  const key = draftKeyForUser(userEmail);
  if (!file.drafts[key]) return;

  delete file.drafts[key];
  file.updated_at = new Date().toISOString();
  await writeJsonFileAsync(FILE_PATH, file);
}
