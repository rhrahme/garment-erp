import fs from "fs";
import path from "path";
import {
  ALL_ERP_DOCUMENT_KEYS,
  CORE_ERP_DOCUMENT_KEYS,
  documentKeyForPath,
  ERP_DOCUMENT_SPECS,
  type ErpDocumentKey,
} from "@/lib/data/document-keys";
import {
  getMissingRequiredFabricSuppliers,
  validateSupplierContacts,
  type SupplierContactsLike,
} from "@/lib/data/required-fabric-suppliers";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type CacheEntry = {
  mtimeMs: number;
  data: unknown;
};

const fileCache = new Map<string, CacheEntry>();
const loadedKeys = new Set<ErpDocumentKey>();
const loadingByKey = new Map<ErpDocumentKey, Promise<void>>();
let erpBootstrapPromise: Promise<void> | null = null;

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

  let dataToWrite = payload;

  if (documentKey === "supplier_contacts") {
    const incoming = payload as SupplierContactsLike;
    const remote = await readFromSupabase<SupplierContactsLike>("supplier_contacts");
    if (remote) {
      const byId = new Map(remote.suppliers.map((row) => [row.id, row]));
      for (const row of incoming.suppliers) {
        byId.set(row.id, row);
      }
      dataToWrite = {
        ...remote,
        ...incoming,
        suppliers: [...byId.values()],
      } as T;
    }

    const missing = getMissingRequiredFabricSuppliers(dataToWrite as SupplierContactsLike);
    if (missing.length > 0) {
      console.error(
        `[supplier-contacts] Refusing Supabase write — would drop required suppliers: ${missing.join(", ")}`
      );
      return false;
    }
  }

  const updated_at = new Date().toISOString();
  const { error } = await admin.from("erp_documents").upsert(
    { id: documentKey, data: dataToWrite, updated_at },
    { onConflict: "id" }
  );

  if (error) {
    console.error(`Supabase write failed for ${documentKey}:`, error.message);
    return false;
  }
  return true;
}

async function loadDocumentKey(documentKey: ErpDocumentKey): Promise<void> {
  if (loadedKeys.has(documentKey)) {
    const spec = ERP_DOCUMENT_SPECS[documentKey];
    if (fileCache.has(spec.path)) return;
    loadedKeys.delete(documentKey);
  }

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

/**
 * Load every ERP document into the in-process cache — once per serverless instance.
 * Shared promise: instrumentation (cold start), root layout (SSR), and readJsonFileAsync
 * all await the same work so sync reads never see an empty Supabase fallback.
 */
export async function ensureErpBootstrap(): Promise<void> {
  if (!isSupabaseDocumentsStorage()) return;
  if (!erpBootstrapPromise) {
    erpBootstrapPromise = Promise.all(ALL_ERP_DOCUMENT_KEYS.map((key) => loadDocumentKey(key))).then(
      () => {
        const spec = ERP_DOCUMENT_SPECS.supplier_contacts;
        const cached = fileCache.get(spec.path);
        if (cached) {
          try {
            validateSupplierContacts(cached.data as SupplierContactsLike);
          } catch (error) {
            console.error("[ERP bootstrap] supplier contacts validation failed:", error);
          }
        }
      }
    );
  }
  await erpBootstrapPromise;
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

/** @deprecated Prefer ensureErpBootstrap(). Loads all ERP documents once per process. */
export async function ensureErpDocumentsLoaded(): Promise<void> {
  return ensureErpBootstrap();
}

/** Load JSON document — fetches only this document when Supabase is enabled. */
export async function loadDocument<T>(filePath: string, fallback: T): Promise<T> {
  const documentKey = documentKeyForPath(filePath);

  if (isSupabaseDocumentsStorage() && documentKey) {
    await ensureErpBootstrap();
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
 * Sync read — returns warmed in-process cache only when Supabase is enabled.
 * Call sites must run after ensureErpBootstrap() (root layout + instrumentation on Vercel).
 * Prefer readJsonFileAsync when the caller is already async.
 */
export function readJsonFile<T>(filePath: string, fallback: T): T {
  if (isSupabaseDocumentsStorage()) {
    const cached = fileCache.get(filePath);
    if (cached) return cached.data as T;

    const documentKey = documentKeyForPath(filePath);
    if (process.env.NODE_ENV === "development" && documentKey) {
      console.warn(
        `[ERP] Sync readJsonFile before cache warm for "${documentKey}". ` +
          "Await ensureErpBootstrap() or use readJsonFileAsync()."
      );
    }
    return fallback;
  }
  return readLocalJsonFile(filePath, fallback);
}

/** Auto-load from Supabase (or local) then read — preferred entry point for document-backed data. */
export async function readJsonFileAsync<T>(filePath: string, fallback: T): Promise<T> {
  await ensureErpBootstrap();
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
  erpBootstrapPromise = null;
}

/** Keys currently resident in the in-process cache (for diagnostics). */
export function loadedErpDocumentKeys(): ErpDocumentKey[] {
  return ALL_ERP_DOCUMENT_KEYS.filter((key) => loadedKeys.has(key));
}
