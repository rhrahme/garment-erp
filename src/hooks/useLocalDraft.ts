"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearLocalDraft,
  readLocalDraft,
  writeLocalDraft,
} from "@/lib/autosave/local-draft-storage";
import type { AutoSaveStatus } from "@/hooks/useAutoSave";

type UseLocalDraftOptions<T> = {
  draftKey: string;
  value: T;
  enabled?: boolean;
  canSave?: boolean;
  delayMs?: number;
  onRestore?: (value: T) => void;
  isEmpty?: (value: T) => boolean;
  /** When false, stored drafts are held until restorePending() is called. Default true. */
  autoRestore?: boolean;
  /** Optional override for reading stored drafts (e.g. merge legacy localStorage keys). */
  readStored?: () => T | null;
};

export function useLocalDraft<T>({
  draftKey,
  value,
  enabled = true,
  canSave = true,
  delayMs = 20_000,
  onRestore,
  isEmpty,
  autoRestore = true,
  readStored,
}: UseLocalDraftOptions<T>) {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [hasPendingRestore, setHasPendingRestore] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<T | null>(null);

  const valueRef = useRef(value);
  const onRestoreRef = useRef(onRestore);
  const pendingDraftRef = useRef<T | null>(null);
  const lastWrittenRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreAttemptedRef = useRef(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

  const persistNow = useCallback(() => {
    if (!enabled || !canSave) return;
    const next = valueRef.current;
    if (isEmpty?.(next)) {
      clearLocalDraft(draftKey);
      lastWrittenRef.current = null;
      setStatus("idle");
      setError(null);
      return;
    }

    setStatus("saving");
    setError(null);
    try {
      const serialized = JSON.stringify(next);
      if (serialized === lastWrittenRef.current) {
        setStatus("saved");
        return;
      }
      writeLocalDraft(draftKey, next);
      lastWrittenRef.current = serialized;
      setStatus("saved");
      if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
      savedFlashRef.current = setTimeout(() => setStatus("idle"), 2500);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save draft locally");
    }
  }, [canSave, draftKey, enabled, isEmpty]);

  useEffect(() => {
    if (!enabled || restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;
    setHydrated(true);

    const stored = readStored?.() ?? readLocalDraft<T>(draftKey);
    if (stored && !(isEmpty?.(stored) ?? false)) {
      if (autoRestore && onRestoreRef.current) {
        onRestoreRef.current(stored);
        lastWrittenRef.current = JSON.stringify(stored);
        setRestored(true);
      } else {
        pendingDraftRef.current = stored;
        setPendingDraft(stored);
        setHasPendingRestore(true);
      }
    }
  }, [autoRestore, draftKey, enabled, isEmpty, readStored]);

  const restorePending = useCallback(() => {
    const stored = pendingDraftRef.current ?? readStored?.() ?? readLocalDraft<T>(draftKey);
    if (!stored || (isEmpty?.(stored) ?? false) || !onRestoreRef.current) return;
    onRestoreRef.current(stored);
    lastWrittenRef.current = JSON.stringify(stored);
    setRestored(true);
    setHasPendingRestore(false);
    pendingDraftRef.current = null;
    setPendingDraft(null);
  }, [draftKey, isEmpty, readStored]);

  const dismissPendingRestore = useCallback(() => {
    pendingDraftRef.current = null;
    setPendingDraft(null);
    setHasPendingRestore(false);
  }, []);

  useEffect(() => {
    if (!enabled || !hydrated) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!canSave || isEmpty?.(value)) {
      if (isEmpty?.(value) && lastWrittenRef.current) {
        clearLocalDraft(draftKey);
        lastWrittenRef.current = null;
      }
      if (status !== "saved") setStatus("idle");
      return;
    }

    setStatus("pending");
    debounceRef.current = setTimeout(() => {
      persistNow();
    }, delayMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [canSave, delayMs, draftKey, enabled, hydrated, isEmpty, persistNow, value]);

  useEffect(() => {
    if (!enabled || !hydrated || !canSave || isEmpty?.(value)) return;

    function flushOnHide() {
      if (document.visibilityState === "hidden") {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        persistNow();
      }
    }

    function flushOnUnload() {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      persistNow();
    }

    document.addEventListener("visibilitychange", flushOnHide);
    window.addEventListener("pagehide", flushOnUnload);
    return () => {
      document.removeEventListener("visibilitychange", flushOnHide);
      window.removeEventListener("pagehide", flushOnUnload);
    };
  }, [canSave, enabled, hydrated, isEmpty, persistNow, value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
    };
  }, []);

  const clearDraft = useCallback(() => {
    clearLocalDraft(draftKey);
    lastWrittenRef.current = null;
    pendingDraftRef.current = null;
    setPendingDraft(null);
    setHasPendingRestore(false);
    setRestored(false);
    setStatus("idle");
    setError(null);
  }, [draftKey]);

  const dismissRestore = useCallback(() => {
    setRestored(false);
  }, []);

  return {
    status,
    error,
    restored,
    hydrated,
    hasPendingRestore,
    pendingDraft: hasPendingRestore ? pendingDraft : null,
    isDirty: Boolean(canSave && !(isEmpty?.(value) ?? false)),
    clearDraft,
    dismissRestore,
    restorePending,
    dismissPendingRestore,
    saveNow: persistNow,
  };
}
