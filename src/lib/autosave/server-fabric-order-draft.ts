import {
  clearServerOrderDraft,
  getServerOrderDraft,
  readOrderDraftsFile,
  saveServerOrderDraft,
  type StoredOrderDraft,
} from "@/lib/autosave/server-order-draft";
import {
  describeSalesOrderDraftSummary,
  isSalesOrderDraftEmpty,
  migrateSalesOrderDraft,
  type SalesOrderDraftSummary,
  type SalesOrderFormDraft,
} from "@/lib/autosave/sales-order-draft";
import type { ClientProfile } from "@/lib/types/clients";

export type StoredFabricOrderDraft = StoredOrderDraft;
export type FabricOrderDraftsFile = import("@/lib/autosave/server-order-draft").OrderDraftsFile;

export async function readFabricOrderDraftsFile() {
  return readOrderDraftsFile("fabric");
}

export async function getServerFabricOrderDraft(userEmail: string): Promise<StoredFabricOrderDraft | null> {
  return getServerOrderDraft("fabric", userEmail);
}

export async function saveServerFabricOrderDraft(
  userEmail: string,
  draft: SalesOrderFormDraft
): Promise<StoredFabricOrderDraft | null> {
  return saveServerOrderDraft("fabric", userEmail, draft);
}

export async function clearServerFabricOrderDraft(userEmail: string): Promise<void> {
  return clearServerOrderDraft("fabric", userEmail);
}

export type FabricOrderDraftListEntry = {
  user_email: string;
  saved_at: string;
  saved_by: string;
  summary: SalesOrderDraftSummary;
};

export function summarizeFabricOrderDraft(
  draft: unknown,
  clients: ClientProfile[]
): SalesOrderDraftSummary | null {
  return describeSalesOrderDraftSummary(draft, clients);
}

/** Admin/support: list every non-empty fabric order draft on the server. */
export async function listFabricOrderDraftSummaries(
  clients: ClientProfile[]
): Promise<FabricOrderDraftListEntry[]> {
  const file = await readFabricOrderDraftsFile();
  const entries: FabricOrderDraftListEntry[] = [];

  for (const [userEmail, stored] of Object.entries(file.drafts)) {
    const draft = migrateSalesOrderDraft(stored.draft);
    if (!draft || isSalesOrderDraftEmpty(draft)) continue;

    const summary = describeSalesOrderDraftSummary(draft, clients);
    if (!summary || summary.totalFabrics === 0) continue;

    entries.push({
      user_email: userEmail,
      saved_at: stored.saved_at,
      saved_by: stored.saved_by,
      summary,
    });
  }

  entries.sort((a, b) => b.saved_at.localeCompare(a.saved_at));
  return entries;
}
