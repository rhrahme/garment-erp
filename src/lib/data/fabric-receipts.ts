import path from "path";
import {
  invalidateDocumentCache,
  readJsonFile,
  readJsonFileFresh,
  saveDocument,
} from "@/lib/data/document-persistence";
import type { FabricReceipt, FabricReceiptsFile } from "@/lib/types/fabric-receipts";

const STORE_PATH = path.join(process.cwd(), "src/data/fabric-receipts.json");
const ARCHIVE_PATH = path.join(process.cwd(), "src/data/fabric-receipts-archive.json");
const EMPTY_FABRIC_RECEIPTS: FabricReceiptsFile = { updated_at: null, receipts: [] };

let mutationQueue: Promise<unknown> = Promise.resolve();

/** Serialize read-modify-write so rapid scans do not drop receipts. */
export async function mutateFabricReceipts<T>(
  fn: (store: FabricReceiptsFile) => Promise<T> | T
): Promise<T> {
  const task = mutationQueue.then(async () => {
    const store = structuredClone(readFabricReceiptsFresh());
    const result = await fn(store);
    await writeFabricReceipts(store);
    return result;
  });
  mutationQueue = task.catch(() => {});
  return task;
}

export function readFabricReceipts(): FabricReceiptsFile {
  return readJsonFile(STORE_PATH, EMPTY_FABRIC_RECEIPTS);
}

export function readFabricReceiptsArchive(): FabricReceiptsFile {
  return readJsonFile(ARCHIVE_PATH, EMPTY_FABRIC_RECEIPTS);
}

/** Prefer warmed cache when Supabase is enabled; else read from disk. */
export function readFabricReceiptsFresh(): FabricReceiptsFile {
  return readJsonFileFresh(STORE_PATH, EMPTY_FABRIC_RECEIPTS);
}

export async function writeFabricReceipts(data: FabricReceiptsFile): Promise<FabricReceiptsFile> {
  const payload: FabricReceiptsFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(STORE_PATH, payload);
}

async function writeFabricReceiptsArchive(data: FabricReceiptsFile): Promise<FabricReceiptsFile> {
  const payload: FabricReceiptsFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(ARCHIVE_PATH, payload);
}

/** Move a handed-off receipt out of the hot path document (keeps downloads small). */
export async function archiveFabricReceipt(receipt: FabricReceipt): Promise<void> {
  await mutateFabricReceipts(async (store) => {
    const index = store.receipts.findIndex((item) => item.id === receipt.id);
    if (index >= 0) {
      store.receipts.splice(index, 1);
    }
  });

  const archive = structuredClone(readFabricReceiptsArchive());
  const existing = archive.receipts.findIndex((item) => item.id === receipt.id);
  if (existing >= 0) {
    archive.receipts[existing] = receipt;
  } else {
    archive.receipts.push(receipt);
  }
  await writeFabricReceiptsArchive(archive);
}

export function getFabricReceiptByLineId(lineId: string): FabricReceipt | undefined {
  return readFabricReceiptsFresh().receipts.find((receipt) => receipt.sales_order_line_id === lineId);
}

export function getFabricReceiptById(id: string): FabricReceipt | undefined {
  return readFabricReceipts().receipts.find((receipt) => receipt.id === id);
}

export function invalidateFabricReceiptsCache(): void {
  invalidateDocumentCache(STORE_PATH);
  invalidateDocumentCache(ARCHIVE_PATH);
}
