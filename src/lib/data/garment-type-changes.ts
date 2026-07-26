import path from "path";
import {
  readJsonFile,
  readJsonFileFresh,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import type { GarmentTypeChange, GarmentTypeChangesFile } from "@/lib/types/garment-type-changes";

const STORE_PATH = path.join(process.cwd(), "src/data/garment-type-changes.json");
const EMPTY: GarmentTypeChangesFile = { updated_at: null, changes: [] };

export function readGarmentTypeChanges(): GarmentTypeChangesFile {
  return readJsonFile(STORE_PATH, EMPTY);
}

export function readGarmentTypeChangesFresh(): GarmentTypeChangesFile {
  return readJsonFileFresh(STORE_PATH, EMPTY);
}

export async function readGarmentTypeChangesFreshAsync(): Promise<GarmentTypeChangesFile> {
  return readJsonFileFreshAsync(STORE_PATH, EMPTY, { force: true });
}

export async function writeGarmentTypeChanges(data: GarmentTypeChangesFile): Promise<GarmentTypeChangesFile> {
  const payload: GarmentTypeChangesFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(STORE_PATH, payload);
}

export async function appendGarmentTypeChange(change: GarmentTypeChange): Promise<GarmentTypeChange> {
  const store = structuredClone(await readGarmentTypeChangesFreshAsync());
  store.changes.unshift(change);
  await writeGarmentTypeChanges(store);
  return change;
}

export function listGarmentTypeChanges(limit = 50): GarmentTypeChange[] {
  return readGarmentTypeChangesFresh().changes.slice(0, limit);
}

export function listGarmentTypeChangesForSalesOrder(salesOrderId: string): GarmentTypeChange[] {
  return readGarmentTypeChangesFresh().changes.filter(
    (change) => change.sales_order_id === salesOrderId
  );
}

export function listUnacknowledgedGarmentTypeChanges(limit = 50): GarmentTypeChange[] {
  return readGarmentTypeChangesFresh()
    .changes.filter((change) => change.acknowledged_at == null)
    .slice(0, limit);
}

export function countUnacknowledgedGarmentTypeChanges(): number {
  return readGarmentTypeChangesFresh().changes.filter((change) => change.acknowledged_at == null)
    .length;
}

export async function markGarmentTypeChangeAcknowledged(
  changeId: string,
  acknowledgedBy: string
): Promise<{ change: GarmentTypeChange; newlyAcknowledged: boolean } | null> {
  const store = structuredClone(await readGarmentTypeChangesFreshAsync());
  const index = store.changes.findIndex((change) => change.id === changeId);
  if (index < 0) return null;

  const existing = store.changes[index]!;
  if (existing.acknowledged_at) {
    return { change: existing, newlyAcknowledged: false };
  }

  const updated: GarmentTypeChange = {
    ...existing,
    acknowledged_at: new Date().toISOString(),
    acknowledged_by: acknowledgedBy,
  };
  store.changes[index] = updated;
  await writeGarmentTypeChanges(store);
  return { change: updated, newlyAcknowledged: true };
}
