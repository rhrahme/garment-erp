import {
  clearServerOrderDraft,
  getServerOrderDraft,
  readOrderDraftsFile,
  saveServerOrderDraft,
  type StoredOrderDraft,
} from "@/lib/autosave/server-order-draft";
import type { SalesOrderFormDraft } from "@/lib/autosave/sales-order-draft";

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
