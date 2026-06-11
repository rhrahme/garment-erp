import fs from "fs";
import path from "path";
import {
  ALL_ERP_DOCUMENT_KEYS,
  CORE_ERP_DOCUMENT_KEYS,
  documentKeyForPath,
  ERP_DOCUMENT_SPECS,
  type ErpDocumentKey,
} from "@/lib/data/document-keys";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type CacheEntry = {
  mtimeMs: number;
  data: unknown;
};

const fileCache = new Map<string, CacheEntry>();
const loadedKeys = new Set<ErpDocumentKey>();
const loadingByKey = new Map<ErpDocumentKey, Promise<void>>();

/** Thrown when sync readJsonFile runs before Supabase-backed cache is warmed. */
export class ColdDocumentCacheError extends Error {
  readonly documentKey: ErpDocumentKey | null;

  constructor(filePath: string, documentKey: ErpDocumentKey | null) {
    const keyLabel = documentKey ?? path.basename(filePath);
    super(
      `ERP document "${keyLabel}" is not loaded. ` +
        `Use readJsonFileAsync/loadDocument or ensureDocumentsLoaded(["${documentKey ?? "…"}"]) before sync read.`
    );
    this.name = "ColdDocumentCacheError";
    this.documentKey = documentKey;
  }
}

export function isSupabaseDocumentsStorage(): boolean {
  if (process.env.ERP_USE_JSON === "true") return false;
  return isSupabaseConfigured() && isSupabaseAdminConfigured();
}

function readLocalJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const stat = fs.statSync(filePath);
    const cached = fileCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.data as T;
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
    fileCache.set(filePath, { mtimeMs: stat.mtimeMs, data });
    return data;
  } catch {
    return fallback;
  }
}

function isLocalJsonWritable(): boolean {
  return process.env.VERCEL !== "1";
}

function cacheJsonFile<T>(filePath: string, data: T): T {
  fileCache.set(filePath, { mtimeMs: Date.now(), data });
  return data;
}

function writeLocalJsonFile<T>(filePath: string, data: T): T {
  if (!isLocalJsonWritable()) {
    return cacheJsonFile(filePath, data);
  }
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    const stat = fs.statSync(filePath);
    fileCache.set(filePath, { mtimeMs: stat.mtimeMs, data });
    return data;
  } catch (error) {
    console.error(`Local JSON write skipped for ${filePath}:`, error);
    return cacheJsonFile(filePath, data);
  }
}

async function readFromSupabase<T>(documentKey: ErpDocumentKey): Promise<T | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from("erp_documents")
    .select("data")
    .eq("id", documentKey)
    .maybeSingle();

  if (error) {
    console.error(`Supabase read failed for ${documentKey}:`, error.message);
    return null;
  }
  if (!data?.data) return null;
  return data.data as T;
}

async function writeToSupabase<T>(documentKey: ErpDocumentKey, payload: T): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;

  const updated_at = new Date().toISOString();
  const { error } = await admin.from("erp_documents").upsert(
    { id: documentKey, data: payload, updated_at },
    { onConflict: "id" }
  );

  if (error) {
    console.error(`Supabase write failed for ${documentKey}:`, error.message);
    return false;
  }
  return true;
}

async function loadDocumentKey(documentKey: ErpDocumentKey): Promise<void> {
  if (loadedKeys.has(documentKey)) return;

  const pending = loadingByKey.get(documentKey);
  if (pending) {
    await pending;
    return;
  }

  const task = (async () => {
    const spec = ERP_DOCUMENT_SPECS[documentKey];
    if (isSupabaseDocumentsStorage()) {
      const remote = await readFromSupabase<unknown>(documentKey);
      if (remote != null) {
        fileCache.set(spec.path, { mtimeMs: Date.now(), data: remote });
        loadedKeys.add(documentKey);
        return;
      }
    }
    const local = readLocalJsonFile(spec.path, spec.fallback);
    fileCache.set(spec.path, { mtimeMs: Date.now(), data: local });
    loadedKeys.add(documentKey);
  })();

  loadingByKey.set(documentKey, task);
  try {
    await task;
  } finally {
    loadingByKey.delete(documentKey);
  }
}

/** Load specific ERP documents from Supabase (or local) — once per process per key. */
export async function ensureDocumentsLoaded(keys: readonly ErpDocumentKey[]): Promise<void> {
  if (!isSupabaseDocumentsStorage()) return;
  await Promise.all(keys.map((key) => loadDocumentKey(key)));
}

/** Load the ERP document backing a JSON file path, if mapped. No-op in JSON-only mode. */
export async function ensureDocumentForPath(filePath: string): Promise<void> {
  const documentKey = documentKeyForPath(filePath);
  if (!documentKey) return;
  await ensureDocumentsLoaded([documentKey]);
}

/** @deprecated Prefer ensureDocumentsLoaded with explicit keys. Loads core docs only. */
export async function ensureErpDocumentsLoaded(): Promise<void> {
  return ensureDocumentsLoaded(CORE_ERP_DOCUMENT_KEYS);
}

/** Load JSON document — fetches only this document when Supabase is enabled. */
export async function loadDocument<T>(filePath: string, fallback: T): Promise<T> {
  const documentKey = documentKeyForPath(filePath);

  if (isSupabaseDocumentsStorage() && documentKey) {
    await loadDocumentKey(documentKey);
    const cached = fileCache.get(filePath);
    if (cached) return cached.data as T;
  }

  return readLocalJsonFile(filePath, fallback);
}

/** Save JSON document — writes Supabase + local backup file. */
export async function saveDocument<T>(filePath: string, data: T): Promise<T> {
  const documentKey = documentKeyForPath(filePath);

  if (isSupabaseDocumentsStorage() && documentKey) {
    const ok = await writeToSupabase(documentKey, data);
    if (!ok) {
      throw new Error(`Failed to save ${documentKey} to Supabase.`);
    }
    fileCache.set(filePath, { mtimeMs: Date.now(), data });
    if (documentKey) loadedKeys.add(documentKey);
  }

  return writeLocalJsonFile(filePath, data);
}

/**
 * Sync read — memory cache when warmed by ensureDocumentsLoaded / loadDocument / readJsonFileAsync.
 * When Supabase is source of truth and cache is cold, returns fallback (never stale git JSON).
 * Prefer readJsonFileAsync for server paths that need live Supabase data.
 */
export function readJsonFile<T>(filePath: string, fallback: T): T {
  if (isSupabaseDocumentsStorage()) {
    const cached = fileCache.get(filePath);
    if (cached) return cached.data as T;
    return fallback;
  }
  return readLocalJsonFile(filePath, fallback);
}

/** Auto-load from Supabase (or local) then read — preferred entry point for document-backed data. */
export async function readJsonFileAsync<T>(filePath: string, fallback: T): Promise<T> {
  await ensureDocumentForPath(filePath);
  return readJsonFile(filePath, fallback);
}

/** Read warmed cache when available; otherwise local disk (JSON-only mode) or fallback. */
export function readJsonFileFresh<T>(filePath: string, fallback: T): T {
  if (isSupabaseDocumentsStorage()) {
    const cached = fileCache.get(filePath);
    if (cached) return cached.data as T;
    return fallback;
  }
  invalidateDocumentCache(filePath);
  return readLocalJsonFile(filePath, fallback);
}

/** Reload from Supabase only when cache is cold — avoids re-downloading on every list refresh. */
export async function readJsonFileFreshAsync<T>(
  filePath: string,
  fallback: T,
  options?: { force?: boolean }
): Promise<T> {
  const documentKey = documentKeyForPath(filePath);

  if (isSupabaseDocumentsStorage() && documentKey) {
    if (!options?.force) {
      const cached = fileCache.get(filePath);
      if (cached) return cached.data as T;
    }
    const remote = await readFromSupabase<T>(documentKey);
    if (remote != null) {
      fileCache.set(filePath, { mtimeMs: Date.now(), data: remote });
      loadedKeys.add(documentKey);
      return remote;
    }
  }

  invalidateDocumentCache(filePath);
  return readLocalJsonFile(filePath, fallback);
}

/** Sync write — updates local file + memory; Supabase write is async (best-effort). */
export function writeJsonFile<T>(filePath: string, data: T): T {
  const documentKey = documentKeyForPath(filePath);

  if (isSupabaseDocumentsStorage() && documentKey) {
    const saved = cacheJsonFile(filePath, data);
    loadedKeys.add(documentKey);
    void writeToSupabase(documentKey, saved).catch((error) => {
      console.error(`Async Supabase write failed for ${documentKey}:`, error);
    });
    if (isLocalJsonWritable()) {
      try {
        writeLocalJsonFile(filePath, saved);
      } catch {
        // Best-effort local mirror for dev machines only.
      }
    }
    return saved;
  }

  return writeLocalJsonFile(filePath, data);
}

/** Preferred write path when Supabase is the source of truth. */
export async function writeJsonFileAsync<T>(filePath: string, data: T): Promise<T> {
  return saveDocument(filePath, data);
}

export function invalidateDocumentCache(filePath?: string): void {
  if (filePath) {
    fileCache.delete(filePath);
    const key = documentKeyForPath(filePath);
    if (key) loadedKeys.delete(key);
    return;
  }
  fileCache.clear();
  loadedKeys.clear();
  loadingByKey.clear();
}

/** Keys currently resident in the in-process cache (for diagnostics). */
export function loadedErpDocumentKeys(): ErpDocumentKey[] {
  return ALL_ERP_DOCUMENT_KEYS.filter((key) => loadedKeys.has(key));
}
