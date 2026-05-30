import path from "path";
import { readJsonFile, writeJsonFile } from "@/lib/data/json-file-cache";

const STORE_PATH = path.join(process.cwd(), "supplier-replies.local.json");

export type SupplierLineUpdate = {
  fabric_number: string;
  status: "confirmed" | "temp_unavailable" | "permanently_unavailable" | "substituted";
  restock_date?: string | null;
  substitute_fabric_number?: string | null;
  note?: string | null;
};

export interface SupplierReplyRecord {
  id: string;
  po_number: string | null;
  supplier_id: string | null;
  from_address: string;
  subject: string;
  body: string;
  received_at: string;
  message_id?: string | null;
  awb_numbers?: string[];
  invoice_numbers?: string[];
  attachment_names?: string[];
  purchase_order_id?: string | null;
  line_updates?: SupplierLineUpdate[];
}

interface ReplyStore {
  replies: SupplierReplyRecord[];
}

function readStore(): ReplyStore {
  return readJsonFile(STORE_PATH, { replies: [] });
}

function writeStore(store: ReplyStore): void {
  writeJsonFile(STORE_PATH, store);
}

export function upsertSupplierReply(input: Omit<SupplierReplyRecord, "id">): SupplierReplyRecord {
  const store = readStore();

  if (input.message_id) {
    const index = store.replies.findIndex(
      (reply) => reply.message_id?.toLowerCase() === input.message_id?.toLowerCase()
    );
    if (index >= 0) {
      const existing = store.replies[index];
      const merged: SupplierReplyRecord = {
        ...existing,
        ...input,
        awb_numbers: uniqueStrings([...(existing.awb_numbers ?? []), ...(input.awb_numbers ?? [])]),
        invoice_numbers: uniqueStrings([
          ...(existing.invoice_numbers ?? []),
          ...(input.invoice_numbers ?? []),
        ]),
        attachment_names: uniqueStrings([
          ...(existing.attachment_names ?? []),
          ...(input.attachment_names ?? []),
        ]),
        line_updates: mergeLineUpdates(existing.line_updates, input.line_updates),
      };
      store.replies[index] = merged;
      writeStore(store);
      return merged;
    }
  }

  const record: SupplierReplyRecord = {
    id: `reply-${Date.now()}`,
    awb_numbers: [],
    invoice_numbers: [],
    attachment_names: [],
    message_id: null,
    purchase_order_id: null,
    ...input,
  };
  store.replies.unshift(record);
  writeStore(store);
  return record;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function mergeLineUpdates(
  existing: SupplierLineUpdate[] | undefined,
  incoming: SupplierLineUpdate[] | undefined
): SupplierLineUpdate[] | undefined {
  if (!incoming?.length) return existing;
  const map = new Map<string, SupplierLineUpdate>();
  for (const update of existing ?? []) {
    map.set(update.fabric_number.trim().toUpperCase(), update);
  }
  for (const update of incoming) {
    map.set(update.fabric_number.trim().toUpperCase(), update);
  }
  return [...map.values()];
}

/** @deprecated Use upsertSupplierReply — kept for callers that only insert once. */
export function logSupplierReply(input: Omit<SupplierReplyRecord, "id">): SupplierReplyRecord {
  return upsertSupplierReply(input);
}

export function listSupplierReplies(limit = 100): SupplierReplyRecord[] {
  return readStore().replies.slice(0, limit);
}
