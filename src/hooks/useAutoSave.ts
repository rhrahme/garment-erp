"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "waiting" | "pending" | "saving" | "saved" | "error";

type UseAutoSaveOptions = {
  isDirty: boolean;
  canSave: boolean;
  onSave: () => Promise<void>;
  delayMs?: number;
  enabled?: boolean;
  waitingMessage?: string;
};

export function useAutoSave({
  isDirty,
  canSave,
  onSave,
  delayMs = 20_000,
  enabled = true,
  waitingMessage = "Complete required fields to save",
}: UseAutoSaveOptions) {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const onSaveRef = useRef(onSave);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const runSave = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setStatus("saving");
    setError(null);
    try {
      await onSaveRef.current();
      setStatus("saved");
      if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
      savedFlashRef.current = setTimeout(() => {
        setStatus("idle");
      }, 2500);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Auto-save failed");
    } finally {
      savingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!isDirty) {
      if (status !== "saved") setStatus("idle");
      return;
    }

    if (!canSave) {
      setStatus("waiting");
      setError(null);
      return;
    }

    setStatus("pending");
    debounceRef.current = setTimeout(() => {
      void runSave();
    }, delayMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, isDirty, canSave, delayMs, runSave]);

  useEffect(() => {
    if (!enabled || !isDirty || !canSave) return;

    function flushOnHide() {
      if (document.visibilityState === "hidden") {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        void runSave();
      }
    }

    function flushOnUnload() {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      void runSave();
    }

    document.addEventListener("visibilitychange", flushOnHide);
    window.addEventListener("pagehide", flushOnUnload);
    return () => {
      document.removeEventListener("visibilitychange", flushOnHide);
      window.removeEventListener("pagehide", flushOnUnload);
    };
  }, [enabled, isDirty, canSave, runSave]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedFlashRef.current) clearTimeout(savedFlashRef.current);
    };
  }, []);

  return {
    status,
    error,
    waitingMessage,
    isSaving: status === "saving",
    saveNow: runSave,
  };
}
