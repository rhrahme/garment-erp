import path from "path";
import {
  ensureDocumentsLoaded,
  readJsonFile,
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import {
  EMPTY_PATTERN_LIBRARY,
  type BasePattern,
  type ClientPattern,
  type PatternLibraryFile,
} from "@/lib/types/pattern-library";

const PATTERN_LIBRARY_PATH = path.join(process.cwd(), "src/data/pattern-library.json");

function normalize(store: PatternLibraryFile): PatternLibraryFile {
  return {
    updated_at: store.updated_at ?? null,
    dictionary: store.dictionary ?? [],
    base_patterns: store.base_patterns ?? [],
    client_patterns: store.client_patterns ?? [],
  };
}

export function readPatternLibrary(): PatternLibraryFile {
  return normalize(readJsonFile(PATTERN_LIBRARY_PATH, EMPTY_PATTERN_LIBRARY));
}

export async function readPatternLibraryAsync(): Promise<PatternLibraryFile> {
  return normalize(await readJsonFileAsync(PATTERN_LIBRARY_PATH, EMPTY_PATTERN_LIBRARY));
}

export async function readPatternLibraryFresh(): Promise<PatternLibraryFile> {
  return normalize(await readJsonFileFreshAsync(PATTERN_LIBRARY_PATH, EMPTY_PATTERN_LIBRARY));
}

export async function writePatternLibrary(data: PatternLibraryFile): Promise<PatternLibraryFile> {
  const next: PatternLibraryFile = { ...data, updated_at: new Date().toISOString() };
  return saveDocument(PATTERN_LIBRARY_PATH, next);
}

export async function ensurePatternLibraryLoaded(): Promise<void> {
  await ensureDocumentsLoaded(["pattern_library", "clients", "sales_orders"]);
}

export async function getBasePatternByIdFresh(id: string): Promise<BasePattern | null> {
  const store = await readPatternLibraryFresh();
  return store.base_patterns.find((base) => base.id === id) ?? null;
}

export async function getClientPatternByIdFresh(id: string): Promise<ClientPattern | null> {
  const store = await readPatternLibraryFresh();
  return store.client_patterns.find((pattern) => pattern.id === id) ?? null;
}
