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
