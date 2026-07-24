import path from "path";
import {
  readJsonFile,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import type {
  ThreadButtonMatchRecord,
  ThreadButtonMatchesFile,
} from "@/lib/types/thread-button-matching";

const STORE_PATH = path.join(process.cwd(), "src/data/thread-button-matches.json");
const EMPTY: ThreadButtonMatchesFile = { updated_at: null, matches: [] };

let mutationQueue: Promise<unknown> = Promise.resolve();

export function readThreadButtonMatches(): ThreadButtonMatchesFile {
  return readJsonFile(STORE_PATH, EMPTY);
}

export async function readThreadButtonMatchesFresh(): Promise<ThreadButtonMatchesFile> {
  return readJsonFileFreshAsync(STORE_PATH, EMPTY, { force: true });
}

export async function writeThreadButtonMatches(
  data: ThreadButtonMatchesFile
): Promise<ThreadButtonMatchesFile> {
  return saveDocument(STORE_PATH, { ...data, updated_at: new Date().toISOString() });
}

export async function mutateThreadButtonMatches<T>(
  fn: (store: ThreadButtonMatchesFile) => T | Promise<T>
): Promise<T> {
  const task = mutationQueue.then(async () => {
    const store = structuredClone(await readThreadButtonMatchesFresh());
    const result = await fn(store);
    await writeThreadButtonMatches(store);
    return result;
  });
  mutationQueue = task.catch(() => {});
  return task;
}

export function getThreadButtonMatchByLineId(
  lineId: string
): ThreadButtonMatchRecord | undefined {
  return readThreadButtonMatches().matches.find(
    (item) => item.sales_order_line_id === lineId
  );
}
