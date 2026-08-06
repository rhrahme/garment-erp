import path from "path";
import {
  readJsonFile,
  readJsonFileFresh,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import type {
  PatternAlterationPendingFile,
  PatternAlterationPendingItem,
  PatternAlterationPendingStatus,
} from "@/lib/types/pattern-alteration-pending";

const STORE_PATH = path.join(process.cwd(), "src/data/pattern-alteration-pending.json");
const EMPTY: PatternAlterationPendingFile = { updated_at: null, items: [] };

export function readPatternAlterationPending(): PatternAlterationPendingFile {
  return readJsonFile(STORE_PATH, EMPTY);
}

export function readPatternAlterationPendingFresh(): PatternAlterationPendingFile {
  return readJsonFileFresh(STORE_PATH, EMPTY);
}

export async function readPatternAlterationPendingFreshAsync(): Promise<PatternAlterationPendingFile> {
  return readJsonFileFreshAsync(STORE_PATH, EMPTY, { force: true });
}

export async function writePatternAlterationPending(
  data: PatternAlterationPendingFile
): Promise<PatternAlterationPendingFile> {
  const payload: PatternAlterationPendingFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(STORE_PATH, payload);
}

function normalizePendingItem(
  item: PatternAlterationPendingItem
): PatternAlterationPendingItem {
  return {
    ...item,
    stitcher_comments: item.stitcher_comments ?? null,
    stitcher_comments_at: item.stitcher_comments_at ?? null,
    stitcher_comments_by: item.stitcher_comments_by ?? null,
    client_pattern_id: item.client_pattern_id ?? null,
    related_articles: item.related_articles ?? [],
  };
}

export function listPatternAlterationPending(
  status?: PatternAlterationPendingStatus | PatternAlterationPendingStatus[],
  limit = 50
): PatternAlterationPendingItem[] {
  const wanted = status
    ? new Set(Array.isArray(status) ? status : [status])
    : null;
  return readPatternAlterationPendingFresh()
    .items.filter((item) => (wanted ? wanted.has(item.status) : true))
    .map(normalizePendingItem)
    .slice(0, limit);
}

export function listOutstandingPatternAlterationPending(limit = 50): PatternAlterationPendingItem[] {
  return listPatternAlterationPending(["pending", "acknowledged"], limit);
}

export function getPatternAlterationPendingById(id: string): PatternAlterationPendingItem | null {
  const trimmed = id.trim();
  if (!trimmed) return null;
  const item =
    readPatternAlterationPendingFresh().items.find((row) => row.id === trimmed) ?? null;
  return item ? normalizePendingItem(item) : null;
}

export function getPatternAlterationPendingBySessionId(
  sessionId: string
): PatternAlterationPendingItem | null {
  const trimmed = sessionId.trim();
  if (!trimmed) return null;
  return (
    readPatternAlterationPendingFresh().items.find((item) => item.session_id === trimmed) ?? null
  );
}

/**
 * Insert or replace by id / session_id. Never duplicates the same session.
 * Does not downgrade acknowledged / chart_updated rows back to pending.
 */
export async function upsertPatternAlterationPending(
  item: PatternAlterationPendingItem
): Promise<{ item: PatternAlterationPendingItem; created: boolean }> {
  const store = structuredClone(await readPatternAlterationPendingFreshAsync());
  const byId = store.items.findIndex((row) => row.id === item.id);
  const bySession = store.items.findIndex((row) => row.session_id === item.session_id);
  const index = byId >= 0 ? byId : bySession;

  if (index >= 0) {
    const existing = store.items[index]!;
    if (existing.status === "chart_updated" || existing.status === "acknowledged") {
      return { item: existing, created: false };
    }
    const next: PatternAlterationPendingItem = {
      ...existing,
      ...item,
      id: existing.id,
      status: existing.status,
      stitcher_comments: existing.stitcher_comments ?? item.stitcher_comments ?? null,
      stitcher_comments_at: existing.stitcher_comments_at ?? item.stitcher_comments_at ?? null,
      stitcher_comments_by: existing.stitcher_comments_by ?? item.stitcher_comments_by ?? null,
      client_pattern_id: existing.client_pattern_id ?? item.client_pattern_id ?? null,
      acknowledged_at: existing.acknowledged_at,
      acknowledged_by: existing.acknowledged_by,
      chart_updated_at: existing.chart_updated_at,
      chart_updated_by: existing.chart_updated_by,
    };
    store.items[index] = next;
    await writePatternAlterationPending(store);
    return { item: next, created: false };
  }

  store.items.unshift(item);
  await writePatternAlterationPending(store);
  return { item, created: true };
}

/** @deprecated Prefer upsertPatternAlterationPending for idempotent writes. */
export async function appendPatternAlterationPending(
  item: PatternAlterationPendingItem
): Promise<PatternAlterationPendingItem> {
  const { item: saved } = await upsertPatternAlterationPending(item);
  return saved;
}

export async function updatePatternAlterationPending(
  id: string,
  patch: Partial<
    Pick<
      PatternAlterationPendingItem,
      | "status"
      | "stitcher_comments"
      | "stitcher_comments_at"
      | "stitcher_comments_by"
      | "client_pattern_id"
      | "acknowledged_at"
      | "acknowledged_by"
      | "chart_updated_at"
      | "chart_updated_by"
    >
  >
): Promise<PatternAlterationPendingItem | null> {
  const store = structuredClone(await readPatternAlterationPendingFreshAsync());
  const index = store.items.findIndex((item) => item.id === id.trim());
  if (index < 0) return null;
  const current = store.items[index]!;
  const next: PatternAlterationPendingItem = { ...current, ...patch };
  store.items[index] = next;
  await writePatternAlterationPending(store);
  return next;
}
