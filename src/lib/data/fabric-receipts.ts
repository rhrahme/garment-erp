import path from "path";
import {
  invalidateDocumentCache,
  readJsonFile,
  readJsonFileFresh,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import type { FabricReceipt, FabricReceiptsFile } from "@/lib/types/fabric-receipts";

const STORE_PATH = path.join(process.cwd(), "src/data/fabric-receipts.json");
const ARCHIVE_PATH = path.join(process.cwd(), "src/data/fabric-receipts-archive.json");
const EMPTY_FABRIC_RECEIPTS: FabricReceiptsFile = { updated_at: null, receipts: [] };

let mutationQueue: Promise<unknown> = Promise.resolve();

/** Serialize read-modify-write so rapid scans do not drop receipts. */
export async function mutateFabricReceipts<T>(
  fn: (store: FabricReceiptsFile) => Promise<T> | T,
  options?: { force?: boolean }
): Promise<T> {
  const task = mutationQueue.then(async () => {
    const store = structuredClone(
      options?.force ? await readFabricReceiptsFreshAsync() : readFabricReceiptsFresh()
    );
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

export async function readFabricReceiptsFreshAsync(): Promise<FabricReceiptsFile> {
  return readJsonFileFreshAsync(STORE_PATH, EMPTY_FABRIC_RECEIPTS, { force: true });
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

/**
 * Receipt lookup that never trusts a cache miss. The warm in-process snapshot can
 * lag Supabase by up to the cache TTL — or be empty on a cold instance — so a
 * fabric received seconds ago via another instance would look "not received".
 * On a miss, force one authoritative read (which also re-warms the cache) before
 * concluding the receipt does not exist. Scans are low-frequency, so the extra
 * read on the miss path is cheap.
 */
export async function getFabricReceiptByLineIdFresh(lineId: string): Promise<FabricReceipt | undefined> {
  const cached = getFabricReceiptByLineId(lineId);
  if (cached) return cached;
  const fresh = await readFabricReceiptsFreshAsync();
  return fresh.receipts.find((receipt) => receipt.sales_order_line_id === lineId);
}

export function getFabricReceiptById(id: string): FabricReceipt | undefined {
  return readFabricReceipts().receipts.find((receipt) => receipt.id === id);
}

/** Active store first, then archive (handed-off receipts). */
export function getFabricReceiptAnywhere(id: string): FabricReceipt | undefined {
  return (
    readFabricReceiptsFresh().receipts.find((receipt) => receipt.id === id) ??
    readFabricReceiptsArchive().receipts.find((receipt) => receipt.id === id)
  );
}

export type FabricReceiptStoreLocation = "active" | "archive";

export function locateFabricReceipt(
  id: string
): { receipt: FabricReceipt; location: FabricReceiptStoreLocation } | null {
  const active = readFabricReceiptsFresh().receipts.find((receipt) => receipt.id === id);
  if (active) return { receipt: active, location: "active" };
  const archived = readFabricReceiptsArchive().receipts.find((receipt) => receipt.id === id);
  if (archived) return { receipt: archived, location: "archive" };
  return null;
}

/**
 * Mutate a receipt in either the active or archive document.
 * Keeps defect reports attached after handoff / settle.
 */
export async function mutateFabricReceiptAnywhere<T>(
  receiptId: string,
  fn: (receipt: FabricReceipt) => Promise<T> | T
): Promise<T> {
  const located = locateFabricReceipt(receiptId);
  if (!located) {
    throw new Error("Fabric receipt not found.");
  }

  if (located.location === "active") {
    return mutateFabricReceipts(async (store) => {
      const receipt = store.receipts.find((item) => item.id === receiptId);
      if (!receipt) throw new Error("Fabric receipt not found.");
      return fn(receipt);
    });
  }

  const archive = structuredClone(
    await readJsonFileFreshAsync(ARCHIVE_PATH, EMPTY_FABRIC_RECEIPTS, { force: true })
  );
  const receipt = archive.receipts.find((item) => item.id === receiptId);
  if (!receipt) throw new Error("Fabric receipt not found.");
  const result = await fn(receipt);
  await writeFabricReceiptsArchive(archive);
  return result;
}

export function invalidateFabricReceiptsCache(): void {
  invalidateDocumentCache(STORE_PATH);
  invalidateDocumentCache(ARCHIVE_PATH);
}

/** Remove active and archived receipts for fabric lines — testing reset only. */
export async function removeFabricReceiptsForLineIds(
  lineIds: string[],
  options?: { force?: boolean }
): Promise<string[]> {
  const lineIdSet = new Set(lineIds);
  const removedIds = new Set<string>();

  await mutateFabricReceipts(
    (store) => {
      store.receipts = store.receipts.filter((receipt) => {
        if (lineIdSet.has(receipt.sales_order_line_id)) {
          removedIds.add(receipt.id);
          return false;
        }
        return true;
      });
    },
    { force: options?.force }
  );

  const archive = options?.force
    ? await readJsonFileFreshAsync(ARCHIVE_PATH, EMPTY_FABRIC_RECEIPTS, { force: true })
    : structuredClone(readFabricReceiptsArchive());
  const nextArchive = archive.receipts.filter((receipt) => {
    if (lineIdSet.has(receipt.sales_order_line_id)) {
      removedIds.add(receipt.id);
      return false;
    }
    return true;
  });

  if (nextArchive.length !== archive.receipts.length) {
    await writeFabricReceiptsArchive({ ...archive, receipts: nextArchive });
  }

  return [...removedIds];
}
