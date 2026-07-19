import path from "path";
import {
  readJsonFile,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import type { SalesWorkspaceFile } from "@/lib/types/sales-workspace";

const STORE_PATH = path.join(process.cwd(), "src/data/sales-workspace.json");
const EMPTY: SalesWorkspaceFile = {
  updated_at: null,
  client_details: [],
  fittings: [],
  milestone_overrides: [],
};

let mutationQueue: Promise<unknown> = Promise.resolve();

export function readSalesWorkspace(): SalesWorkspaceFile {
  return readJsonFile(STORE_PATH, EMPTY);
}

export async function readSalesWorkspaceFresh(): Promise<SalesWorkspaceFile> {
  return readJsonFileFreshAsync(STORE_PATH, EMPTY, { force: true });
}

export async function writeSalesWorkspace(data: SalesWorkspaceFile): Promise<SalesWorkspaceFile> {
  return saveDocument(STORE_PATH, { ...data, updated_at: new Date().toISOString() });
}

export async function mutateSalesWorkspace<T>(
  fn: (store: SalesWorkspaceFile) => T | Promise<T>
): Promise<T> {
  const task = mutationQueue.then(async () => {
    const store = structuredClone(await readSalesWorkspaceFresh());
    const result = await fn(store);
    await writeSalesWorkspace(store);
    return result;
  });
  mutationQueue = task.catch(() => {});
  return task;
}
