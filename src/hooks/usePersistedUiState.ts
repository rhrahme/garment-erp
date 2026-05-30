"use client";

import { useCallback, useEffect, useState } from "react";
import { readLocalDraft, writeLocalDraft } from "@/lib/autosave/local-draft-storage";

/** Persist UI preferences (filters, view mode) in localStorage. */
export function usePersistedUiState<T>(storageKey: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readLocalDraft<T>(storageKey);
    if (stored != null) setValue(stored);
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    writeLocalDraft(storageKey, value);
  }, [hydrated, storageKey, value]);

  const reset = useCallback(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  return { value, setValue, hydrated, reset };
}
