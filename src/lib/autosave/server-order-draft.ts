import path from "path";
import { readJsonFileAsync, writeJsonFileAsync } from "@/lib/data/document-persistence";
import {
  isSalesOrderDraftEmpty,
  mergeSalesOrderDraftPreservingLines,
  migrateSalesOrderDraft,
  type SalesOrderFormDraft,
} from "@/lib/autosave/sales-order-draft";

export type OrderDraftScope = "fabric" | "sales";

const SCOPE_PATHS: Record<OrderDraftScope, string> = {
  fabric: path.join(process.cwd(), "fabric-order-drafts.local.json"),
  sales: path.join(process.cwd(), "sales-order-drafts.local.json"),
};

export type StoredOrderDraft = {
  saved_at: string;
  saved_by: string;
  draft: SalesOrderFormDraft;
};

export type OrderDraftsFile = {
  updated_at: string | null;
  drafts: Record<string, StoredOrderDraft>;
};

const FALLBACK: OrderDraftsFile = { updated_at: null, drafts: {} };

function draftKeyForUser(userEmail: string): string {
  return userEmail.trim().toLowerCase();
}

function filePathForScope(scope: OrderDraftScope): string {
  return SCOPE_PATHS[scope];
}

export async function readOrderDraftsFile(scope: OrderDraftScope): Promise<OrderDraftsFile> {
  return readJsonFileAsync(filePathForScope(scope), FALLBACK);
}

export async function getServerOrderDraft(
  scope: OrderDraftScope,
  userEmail: string
): Promise<StoredOrderDraft | null> {
  const file = await readOrderDraftsFile(scope);
  const entry = file.drafts[draftKeyForUser(userEmail)];
  if (!entry) return null;

  const draft = migrateSalesOrderDraft(entry.draft);
  if (!draft || isSalesOrderDraftEmpty(draft)) return null;

  return { ...entry, draft };
}

export async function saveServerOrderDraft(
  scope: OrderDraftScope,
  userEmail: string,
  draft: SalesOrderFormDraft
): Promise<StoredOrderDraft | null> {
  if (isSalesOrderDraftEmpty(draft)) {
    await clearServerOrderDraft(scope, userEmail);
    return null;
  }

  const file = await readOrderDraftsFile(scope);
  const key = draftKeyForUser(userEmail);
  const existingEntry = file.drafts[key];
  const existingDraft = existingEntry ? migrateSalesOrderDraft(existingEntry.draft) : null;
  const mergedDraft =
    existingDraft && !isSalesOrderDraftEmpty(existingDraft)
      ? mergeSalesOrderDraftPreservingLines(existingDraft, draft)
      : draft;
  const now = new Date().toISOString();
  const stored: StoredOrderDraft = {
    saved_at: now,
    saved_by: userEmail,
    draft: { ...mergedDraft, savedAt: now },
  };

  file.drafts[key] = stored;
  file.updated_at = now;
  await writeJsonFileAsync(filePathForScope(scope), file);
  return stored;
}

export async function clearServerOrderDraft(scope: OrderDraftScope, userEmail: string): Promise<void> {
  const file = await readOrderDraftsFile(scope);
  const key = draftKeyForUser(userEmail);
  if (!file.drafts[key]) return;

  delete file.drafts[key];
  file.updated_at = new Date().toISOString();
  await writeJsonFileAsync(filePathForScope(scope), file);
}
