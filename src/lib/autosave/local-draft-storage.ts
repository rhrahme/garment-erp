const DRAFT_PREFIX = "erp:draft:";

export function draftStorageKey(key: string): string {
  return `${DRAFT_PREFIX}${key}`;
}

export function readLocalDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftStorageKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeLocalDraft<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(draftStorageKey(key), JSON.stringify(value));
}

export function clearLocalDraft(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(draftStorageKey(key));
}
