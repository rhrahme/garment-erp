import path from "path";
import { readJsonFile, readJsonFileAsync, saveDocument } from "@/lib/data/document-persistence";
import type { ProductionScanEvent, ProductionScanEventsFile } from "@/lib/types/production-scan";

const STORE_PATH = path.join(process.cwd(), "src/data/production-scan-events.json");
const EMPTY: ProductionScanEventsFile = { updated_at: null, events: [] };

export function readProductionScanEvents(): ProductionScanEventsFile {
  return readJsonFile(STORE_PATH, EMPTY);
}

export async function readProductionScanEventsAsync(): Promise<ProductionScanEventsFile> {
  return readJsonFileAsync(STORE_PATH, EMPTY);
}

export async function appendProductionScanEvent(event: ProductionScanEvent): Promise<ProductionScanEvent> {
  const store = await readProductionScanEventsAsync();
  store.events.unshift(event);
  await saveDocument(STORE_PATH, {
    ...store,
    updated_at: new Date().toISOString(),
  });
  return event;
}
