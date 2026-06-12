"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isSalesOrderDraftEmpty,
  type SalesOrderFormDraft,
} from "@/lib/autosave/sales-order-draft";

type ServerDraftStatus = "idle" | "loading" | "saving" | "saved" | "error";

export function useServerFabricOrderDraft({
  enabled,
  draft,
}: {
  enabled: boolean;
  draft: SalesOrderFormDraft;
}) {
  const [status, setStatus] = useState<ServerDraftStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<SalesOrderFormDraft | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const draftRef = useRef(draft);
  const lastSerializedRef = useRef<string | null>(null);
  const loadAttemptedRef = useRef(false);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!enabled || loadAttemptedRef.current) return;
    loadAttemptedRef.current = true;
    setStatus("loading");

    void (async () => {
      try {
        const res = await fetch("/api/fabric-order-drafts");
        if (!res.ok) {
          setStatus("idle");
          setHydrated(true);
          return;
        }
        const data = (await res.json()) as {
          draft?: SalesOrderFormDraft;
          saved_at?: string | null;
        };
        if (data.draft && data.saved_at && !isSalesOrderDraftEmpty(data.draft)) {
          setPendingDraft(data.draft);
          setSavedAt(data.saved_at);
        }
        setStatus("idle");
      } catch {
        setStatus("idle");
      } finally {
        setHydrated(true);
      }
    })();
  }, [enabled]);

  const persistNow = useCallback(async () => {
    if (!enabled) return;

    const next = draftRef.current;
    if (isSalesOrderDraftEmpty(next)) {
      try {
        await fetch("/api/fabric-order-drafts", { method: "DELETE" });
        lastSerializedRef.current = null;
        setSavedAt(null);
        setPendingDraft(null);
        setStatus("idle");
        setError(null);
      } catch {
        // Best-effort clear — local draft still protects the user.
      }
      return;
    }

    const serialized = JSON.stringify(next);
    if (serialized === lastSerializedRef.current) {
      return;
    }

    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/fabric-order-drafts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: serialized,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved_at?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Server draft save failed (${res.status}).`);
      }
      lastSerializedRef.current = serialized;
      setSavedAt(data.saved_at ?? new Date().toISOString());
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to save server draft.");
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !hydrated) return;
    if (isSalesOrderDraftEmpty(draft)) return;

    const timer = setTimeout(() => {
      void persistNow();
    }, 5000);

    return () => clearTimeout(timer);
  }, [draft, enabled, hydrated, persistNow]);

  const clearServerDraft = useCallback(async () => {
    if (!enabled) return;
    try {
      await fetch("/api/fabric-order-drafts", { method: "DELETE" });
    } catch {
      // Ignore — order was saved successfully.
    }
    lastSerializedRef.current = null;
    setSavedAt(null);
    setPendingDraft(null);
    setStatus("idle");
    setError(null);
  }, [enabled]);

  const dismissPendingRestore = useCallback(() => {
    setPendingDraft(null);
  }, []);

  return {
    status,
    error,
    savedAt,
    hydrated,
    hasPendingRestore: Boolean(pendingDraft),
    pendingDraft,
    persistNow,
    clearServerDraft,
    dismissPendingRestore,
  };
}
