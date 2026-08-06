import path from "path";
import {
  readJsonFile,
  readJsonFileFresh,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import type {
  PatternOperatorNotice,
  PatternOperatorNoticesFile,
  PatternOperatorNoticeStatus,
} from "@/lib/types/pattern-operator-notices";

const STORE_PATH = path.join(process.cwd(), "src/data/pattern-operator-notices.json");
const EMPTY: PatternOperatorNoticesFile = { updated_at: null, notices: [] };

export function readPatternOperatorNotices(): PatternOperatorNoticesFile {
  return readJsonFile(STORE_PATH, EMPTY);
}

export function readPatternOperatorNoticesFresh(): PatternOperatorNoticesFile {
  return readJsonFileFresh(STORE_PATH, EMPTY);
}

export async function readPatternOperatorNoticesFreshAsync(): Promise<PatternOperatorNoticesFile> {
  return readJsonFileFreshAsync(STORE_PATH, EMPTY, { force: true });
}

export async function writePatternOperatorNotices(
  data: PatternOperatorNoticesFile
): Promise<PatternOperatorNoticesFile> {
  const payload: PatternOperatorNoticesFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(STORE_PATH, payload);
}

export function listPatternOperatorNotices(
  status?: PatternOperatorNoticeStatus | PatternOperatorNoticeStatus[],
  limit = 50
): PatternOperatorNotice[] {
  const wanted = status
    ? new Set(Array.isArray(status) ? status : [status])
    : null;
  return readPatternOperatorNoticesFresh()
    .notices.filter((notice) => (wanted ? wanted.has(notice.status) : true))
    .slice(0, limit);
}

export function listOpenPatternOperatorNotices(limit = 50): PatternOperatorNotice[] {
  return listPatternOperatorNotices("open", limit);
}

export function getPatternOperatorNoticeById(id: string): PatternOperatorNotice | null {
  const trimmed = id.trim();
  if (!trimmed) return null;
  return (
    readPatternOperatorNoticesFresh().notices.find((notice) => notice.id === trimmed) ?? null
  );
}

export async function appendPatternOperatorNotice(
  notice: PatternOperatorNotice
): Promise<PatternOperatorNotice> {
  const store = await readPatternOperatorNoticesFreshAsync();
  if (store.notices.some((row) => row.id === notice.id)) {
    return store.notices.find((row) => row.id === notice.id)!;
  }
  store.notices.unshift(notice);
  await writePatternOperatorNotices(store);
  return notice;
}

export async function updatePatternOperatorNotice(
  id: string,
  patch: Partial<PatternOperatorNotice>
): Promise<PatternOperatorNotice | null> {
  const store = await readPatternOperatorNoticesFreshAsync();
  const index = store.notices.findIndex((notice) => notice.id === id);
  if (index < 0) return null;
  const next = { ...store.notices[index]!, ...patch, id };
  store.notices[index] = next;
  await writePatternOperatorNotices(store);
  return next;
}
