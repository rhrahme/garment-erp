"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { normalizeScannerInput, splitScanInput } from "@/lib/production/scan-input";
import {
  looksLikePartialScanFragment,
  tryMergeScanFragments,
} from "@/lib/production/stitch-scan-buffer";
import {
  isWedgeTerminatorKey,
  shouldStealKeyAsWedge,
} from "@/lib/production/stitch-scan-wedge";
import type { SewingKioskScanResult, SewingKioskUiPhase, SewingSession } from "@/lib/types/sewing-sessions";
import { cn } from "@/lib/utils";

const KIOSK_STORAGE_KEY = "hagan-sewing-kiosk-id";
const QUEUE_STORAGE_KEY = "hagan-sewing-scan-queue";
const MAX_LOG = 40;
/**
 * Gap after last wedge keystroke before treating the buffer as complete.
 * 80ms was splitting real floor scans (FR-0129 | -L02-..., EMP | :id).
 */
const WEDGE_IDLE_FLUSH_MS = 400;
/** Hard cap so a stuck partial fragment still flushes. */
const WEDGE_MAX_BUFFER_MS = 1600;
/** Hidden-input idle flush (Enter still flushes immediately). */
const INPUT_IDLE_FLUSH_MS = 350;
/** Do not steal focus / idle-flush while keys arrived this recently. */
const SCAN_BURST_GUARD_MS = 700;
/** Reclaim hidden-input focus only while the page is idle (no selection / editing). */
const RECLAIM_INTERVAL_MS = 2000;
/** Hold incomplete fragments briefly so the next burst can merge. */
const PARTIAL_MERGE_WINDOW_MS = 900;
/**
 * Inter-key gap under this = USB wedge burst. Steal even over search boxes /
 * text selection so scans cannot disappear silently.
 */
const WEDGE_RAPID_GAP_MS = 90;
/** Manual-entry fields (search / workstation) opt into slow human typing. */
const MANUAL_ENTRY_ATTR = "data-stitch-manual-entry";

export type QueuedScan = {
  id: string;
  code: string;
  captured_at: number;
};

export type ScanLogRow = {
  id: string;
  code: string;
  ok: boolean;
  message: string;
  at: number;
};

type StitchScanCaptureValue = {
  inputRef: RefObject<HTMLInputElement | null>;
  focusInput: () => void;
  kioskId: string;
  setKioskId: (id: string) => void;
  workstationId: string;
  setWorkstationId: (id: string) => void;
  phase: SewingKioskUiPhase;
  message: string | null;
  error: string | null;
  last: SewingKioskScanResult | null;
  openSessions: SewingSession[];
  queue: QueuedScan[];
  log: ScanLogRow[];
  draining: boolean;
  captureArmed: boolean;
  /** Live raw wedge buffer / held partial - shown before API. */
  hearingPreview: string | null;
  flushInputNow: () => void;
  scheduleFlush: () => void;
};

const StitchScanCaptureContext = createContext<StitchScanCaptureValue | null>(null);

export function useStitchScanCapture(): StitchScanCaptureValue {
  const value = useContext(StitchScanCaptureContext);
  if (!value) {
    throw new Error("useStitchScanCapture must be used within StitchScanCaptureProvider");
  }
  return value;
}

function readKioskId(): string {
  if (typeof window === "undefined") return "laptop-1";
  const existing = window.localStorage.getItem(KIOSK_STORAGE_KEY)?.trim();
  if (existing) return existing;
  const generated = `laptop-${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(KIOSK_STORAGE_KEY, generated);
  return generated;
}

function loadPersistedQueue(): QueuedScan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedScan[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistQueue(queue: QueuedScan[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  durationSec: number,
  gainValue = 0.04
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = frequency;
  gain.gain.value = gainValue;
  osc.start(startAt);
  osc.stop(startAt + durationSec);
}

function playBeep(kind: "ok" | "error" | "progress" | "capture") {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (kind === "error") {
      playTone(ctx, 180, ctx.currentTime, 0.18);
      playTone(ctx, 180, ctx.currentTime + 0.26, 0.22);
      return;
    }
    const frequency = kind === "capture" ? 1200 : kind === "progress" ? 520 : 880;
    const duration = kind === "capture" ? 0.05 : 0.1;
    playTone(ctx, frequency, ctx.currentTime, duration);
  } catch {
    /* ignore */
  }
}

/** True when focus is on a real text field (search, workstation, etc.). */
function isTextEntryElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = ((el as HTMLInputElement).type || "text").toLowerCase();
    return !["button", "checkbox", "radio", "submit", "reset", "file", "image", "hidden"].includes(
      type
    );
  }
  return false;
}

/** User is selecting text to copy - do not reclaim focus (scans still capture). */
function hasActiveTextSelection(): boolean {
  if (typeof window === "undefined") return false;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
  const text = sel.toString();
  return text.trim().length > 0;
}

function isManualEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.getAttribute(MANUAL_ENTRY_ATTR) === "true") {
    return true;
  }
  return Boolean(target.closest?.(`[${MANUAL_ENTRY_ATTR}="true"]`));
}

function isCopyOrEditShortcut(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey || event.altKey)) return false;
  const key = event.key.toLowerCase();
  return ["c", "x", "v", "a", "z", "y", "f"].includes(key);
}

function clearPageTextSelection() {
  if (typeof window === "undefined") return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
}

type ProviderProps = {
  children: ReactNode;
  /** Bump when floor tab changes so capture re-arms after navigating away from text fields. */
  rearmKey?: string;
};

export function StitchScanCaptureProvider({ children, rearmKey }: ProviderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const flushTimerRef = useRef<number | null>(null);
  const wedgeBufferRef = useRef("");
  const wedgeBufferStartedAtRef = useRef(0);
  const wedgeFlushTimerRef = useRef<number | null>(null);
  const lastKeyAtRef = useRef(0);
  const pendingPartialRef = useRef<{ code: string; at: number } | null>(null);
  const partialMergeTimerRef = useRef<number | null>(null);
  const queueRef = useRef<QueuedScan[]>([]);
  const drainingRef = useRef(false);
  const kioskIdRef = useRef("laptop-1");
  const workstationRef = useRef("");

  const [kioskId, setKioskIdState] = useState("laptop-1");
  const [workstationId, setWorkstationIdState] = useState("");
  const [phase, setPhase] = useState<SewingKioskUiPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<SewingKioskScanResult | null>(null);
  const [openSessions, setOpenSessions] = useState<SewingSession[]>([]);
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const [log, setLog] = useState<ScanLogRow[]>([]);
  const [draining, setDraining] = useState(false);
  const [captureArmed, setCaptureArmed] = useState(true);
  const [hearingPreview, setHearingPreview] = useState<string | null>(null);

  useEffect(() => {
    const id = readKioskId();
    setKioskIdState(id);
    kioskIdRef.current = id;
    const restored = loadPersistedQueue();
    queueRef.current = restored;
    setQueue(restored);
  }, []);

  // Hydrate open sessions (with badge job_functions) so Scan shows
  // "Cutting in progress" etc. after hard-refresh without waiting for a new scan.
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const res = await fetch("/api/production/sewing-session?period=day");
        if (!res.ok) return;
        const json = (await res.json()) as {
          open_sessions?: SewingSession[];
        };
        if (cancelled) return;
        const mine = (json.open_sessions ?? []).filter(
          (row) =>
            row.kiosk_id === kioskId &&
            (row.status === "open" || row.status === "closing")
        );
        setOpenSessions((prev) => (prev.length > 0 ? prev : mine));
        setPhase((prev) => {
          if (prev !== "idle" || mine.length === 0) return prev;
          return mine[0]!.status === "closing" ? "piece_closing" : "piece_open";
        });
        setLast((prev) => {
          if (prev?.session || mine.length === 0) return prev;
          const focus = mine[0]!;
          return {
            ok: true,
            message: "",
            phase: focus.status === "closing" ? "piece_closing" : "piece_open",
            beep: "ok",
            arm: null,
            piece_arm: null,
            session: focus,
            open_sessions: mine,
          };
        });
      } catch {
        // Keep idle UI; next scan will refresh.
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [kioskId]);

  useEffect(() => {
    kioskIdRef.current = kioskId;
  }, [kioskId]);

  useEffect(() => {
    workstationRef.current = workstationId;
  }, [workstationId]);

  const setKioskId = useCallback((id: string) => {
    const next = id.trim() || "laptop-1";
    window.localStorage.setItem(KIOSK_STORAGE_KEY, next);
    setKioskIdState(next);
  }, []);

  const setWorkstationId = useCallback((id: string) => {
    setWorkstationIdState(id);
  }, []);

  const markScanKey = useCallback(() => {
    lastKeyAtRef.current = Date.now();
  }, []);

  const inScanBurst = useCallback(() => {
    if (wedgeBufferRef.current.length > 0) return true;
    if ((inputRef.current?.value?.length ?? 0) > 0) return true;
    return Date.now() - lastKeyAtRef.current < SCAN_BURST_GUARD_MS;
  }, []);

  /**
   * Focus reclaim only - never used to drop wedge keys.
   * Manual fields + text selection keep focus; rapid USB scans still capture.
   */
  const isFocusReclaimBlocked = useCallback(() => {
    const active = document.activeElement;
    if (active && active !== inputRef.current && isManualEntryTarget(active)) return true;
    if (active && active !== inputRef.current && isTextEntryElement(active)) return true;
    if (hasActiveTextSelection()) return true;
    return false;
  }, []);

  const refreshArmedState = useCallback(() => {
    // Armed means USB wedge capture is live (always, except we show amber when
    // a manual field is focused so staff know slow typing goes to that field).
    const active = document.activeElement;
    const manual = Boolean(active && isManualEntryTarget(active));
    setCaptureArmed(!manual || inScanBurst());
  }, [inScanBurst]);

  const shouldReclaimFocus = useCallback(() => {
    // Never yank focus mid-scan - that splits USB wedge input across two buffers.
    if (inScanBurst()) return false;
    if (isFocusReclaimBlocked()) return false;
    const active = document.activeElement;
    if (active === inputRef.current) return false;
    return true;
  }, [inScanBurst, isFocusReclaimBlocked]);

  const focusInput = useCallback(() => {
    if (!shouldReclaimFocus()) {
      refreshArmedState();
      return;
    }
    clearPageTextSelection();
    inputRef.current?.focus({ preventScroll: true });
    setCaptureArmed(true);
  }, [refreshArmedState, shouldReclaimFocus]);

  useEffect(() => {
    focusInput();
    const id = window.setInterval(() => {
      if (shouldReclaimFocus()) focusInput();
      else refreshArmedState();
    }, RECLAIM_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [focusInput, refreshArmedState, shouldReclaimFocus]);

  useEffect(() => {
    if (!isFocusReclaimBlocked()) focusInput();
    else refreshArmedState();
  }, [rearmKey, focusInput, isFocusReclaimBlocked, refreshArmedState]);

  useEffect(() => {
    const onFocusIn = () => refreshArmedState();
    const onSelectionChange = () => refreshArmedState();
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [refreshArmedState]);

  const syncQueueState = useCallback((next: QueuedScan[]) => {
    queueRef.current = next;
    setQueue(next);
    persistQueue(next);
  }, []);

  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    setDraining(true);

    while (queueRef.current.length > 0) {
      const item = queueRef.current[0]!;
      try {
        const res = await fetch("/api/production/sewing-session/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            raw: item.code,
            kiosk_id: kioskIdRef.current,
            workstation_id: workstationRef.current.trim() || null,
          }),
        });
        let data = {} as SewingKioskScanResult & { error?: string };
        try {
          data = (await res.json()) as SewingKioskScanResult & { error?: string };
        } catch {
          data = {} as SewingKioskScanResult & { error?: string };
        }
        // Auth/middleware rejects never reach processSewingKioskScan, so they are
        // not written to sewing_scan_failures — surface that clearly on the kiosk.
        const authBlocked = res.status === 401 || res.status === 403;
        const ok = !authBlocked && Boolean(data.ok ?? res.ok);
        const msg = authBlocked
          ? res.status === 403
            ? "Scan blocked - this login cannot use the stitch kiosk. Sign in as stitch@hagan.pro."
            : "Login expired or auth timed out - refresh and sign in again, then rescan."
          : data.message ?? data.error ?? (ok ? "OK" : `Scan failed (HTTP ${res.status})`);

        setLast(data);
        if (data.phase) setPhase(data.phase);
        setMessage(msg);
        setError(ok ? null : msg);
        if (data.open_sessions) setOpenSessions(data.open_sessions);
        playBeep(data.beep ?? (ok ? "ok" : "error"));
        setLog((prev) =>
          [
            { id: item.id, code: item.code, ok, message: msg, at: Date.now() },
            ...prev,
          ].slice(0, MAX_LOG)
        );
      } catch (err) {
        const msg =
          err instanceof Error
            ? `Network error - scan not saved. ${err.message}`
            : "Network error - scan not saved.";
        setError(msg);
        playBeep("error");
        setLog((prev) =>
          [
            { id: item.id, code: item.code, ok: false, message: msg, at: Date.now() },
            ...prev,
          ].slice(0, MAX_LOG)
        );
      }

      syncQueueState(queueRef.current.slice(1));
      if (shouldReclaimFocus()) focusInput();
      else refreshArmedState();
    }

    drainingRef.current = false;
    setDraining(false);
    if (shouldReclaimFocus()) focusInput();
    else refreshArmedState();
  }, [focusInput, refreshArmedState, shouldReclaimFocus, syncQueueState]);

  const enqueueCodes = useCallback(
    (parts: string[]) => {
      const added: QueuedScan[] = [];
      for (const part of parts) {
        const code = normalizeScannerInput(part);
        if (!code) continue;
        added.push({
          id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          code,
          captured_at: Date.now(),
        });
      }
      if (added.length === 0) return;

      setHearingPreview(null);
      const next = [...queueRef.current, ...added];
      syncQueueState(next);
      playBeep("capture");
      // Defer focus reclaim until the burst window ends - reclaiming mid-QR
      // was splitting scans across document buffer + hidden input.
      window.setTimeout(() => {
        if (shouldReclaimFocus()) focusInput();
        else refreshArmedState();
      }, SCAN_BURST_GUARD_MS);
      void drainQueue();
    },
    [drainQueue, focusInput, refreshArmedState, shouldReclaimFocus, syncQueueState]
  );

  const flushPendingPartial = useCallback(() => {
    if (partialMergeTimerRef.current) {
      window.clearTimeout(partialMergeTimerRef.current);
      partialMergeTimerRef.current = null;
    }
    const pending = pendingPartialRef.current;
    pendingPartialRef.current = null;
    if (!pending) return;
    enqueueCodes([pending.code]);
  }, [enqueueCodes]);

  const captureCodes = useCallback(
    (parts: string[]) => {
      for (const part of parts) {
        const code = normalizeScannerInput(part);
        if (!code) continue;

        const pending = pendingPartialRef.current;
        if (pending) {
          const merged = tryMergeScanFragments(pending.code, code);
          if (merged) {
            pendingPartialRef.current = null;
            if (partialMergeTimerRef.current) {
              window.clearTimeout(partialMergeTimerRef.current);
              partialMergeTimerRef.current = null;
            }
            if (looksLikePartialScanFragment(merged)) {
              pendingPartialRef.current = { code: merged, at: Date.now() };
              setHearingPreview(merged);
              partialMergeTimerRef.current = window.setTimeout(
                () => flushPendingPartial(),
                PARTIAL_MERGE_WINDOW_MS
              );
            } else {
              enqueueCodes([merged]);
            }
            continue;
          }
          // Different code - submit the held fragment, then handle the new one.
          flushPendingPartial();
        }

        if (looksLikePartialScanFragment(code)) {
          pendingPartialRef.current = { code, at: Date.now() };
          setHearingPreview(code);
          if (partialMergeTimerRef.current) {
            window.clearTimeout(partialMergeTimerRef.current);
          }
          partialMergeTimerRef.current = window.setTimeout(
            () => flushPendingPartial(),
            PARTIAL_MERGE_WINDOW_MS
          );
          continue;
        }

        enqueueCodes([code]);
      }
    },
    [enqueueCodes, flushPendingPartial]
  );

  const flushInputNow = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const parts = splitScanInput(el.value);
    el.value = "";
    captureCodes(parts);
  }, [captureCodes]);

  const scheduleFlush = useCallback(() => {
    markScanKey();
    if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => {
      const value = inputRef.current?.value ?? "";
      const age = Date.now() - lastKeyAtRef.current;
      // Hold incomplete-looking input a bit longer (same race as wedge path).
      if (
        looksLikePartialScanFragment(value) &&
        age < WEDGE_MAX_BUFFER_MS
      ) {
        flushTimerRef.current = window.setTimeout(() => flushInputNow(), INPUT_IDLE_FLUSH_MS);
        return;
      }
      flushInputNow();
    }, INPUT_IDLE_FLUSH_MS);
  }, [flushInputNow, markScanKey]);

  const flushWedgeBuffer = useCallback(
    (force = false) => {
      if (wedgeFlushTimerRef.current) {
        window.clearTimeout(wedgeFlushTimerRef.current);
        wedgeFlushTimerRef.current = null;
      }
      const raw = wedgeBufferRef.current;
      if (!raw) return;

      const age = Date.now() - wedgeBufferStartedAtRef.current;
      if (
        !force &&
        looksLikePartialScanFragment(raw) &&
        age < WEDGE_MAX_BUFFER_MS
      ) {
        // Still looks incomplete - wait for more keystrokes or Enter.
        wedgeFlushTimerRef.current = window.setTimeout(() => {
          flushWedgeBuffer(false);
        }, WEDGE_IDLE_FLUSH_MS);
        return;
      }

      wedgeBufferRef.current = "";
      wedgeBufferStartedAtRef.current = 0;
      captureCodes(splitScanInput(raw));
    },
    [captureCodes]
  );

  const scheduleWedgeFlush = useCallback(() => {
    if (wedgeFlushTimerRef.current) window.clearTimeout(wedgeFlushTimerRef.current);
    wedgeFlushTimerRef.current = window.setTimeout(() => {
      flushWedgeBuffer(false);
    }, WEDGE_IDLE_FLUSH_MS);
  }, [flushWedgeBuffer]);

  /**
   * Single document-level wedge path. Rapid USB keystrokes are ALWAYS stolen
   * (even over search/workstation or text selection). Slow typing in marked
   * manual-entry fields is left alone. Never silently drop a scan burst.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.isComposing) return;
      if (isCopyOrEditShortcut(event)) return;

      const now = Date.now();
      const gapMs = lastKeyAtRef.current > 0 ? now - lastKeyAtRef.current : Number.POSITIVE_INFINITY;
      const alreadyBuffering = wedgeBufferRef.current.length > 0;
      const target = event.target;
      const inManual = target !== inputRef.current && isManualEntryTarget(target);

      if (isWedgeTerminatorKey(event.key)) {
        if (!wedgeBufferRef.current && !pendingPartialRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        markScanKey();
        if (wedgeBufferRef.current) {
          flushWedgeBuffer(true);
        } else {
          flushPendingPartial();
        }
        return;
      }

      if (event.key.length !== 1) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const steal = shouldStealKeyAsWedge({
        alreadyBuffering,
        gapMs,
        rapidGapMs: WEDGE_RAPID_GAP_MS,
        inManualEntryField: inManual,
      });
      if (!steal) return;

      // Recover the first char if a rapid burst started in a manual field
      // (that first keystroke was allowed through before we detected the burst).
      if (!alreadyBuffering && inManual && gapMs < WEDGE_RAPID_GAP_MS) {
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          const value = target.value;
          if (value.length > 0) {
            const prefix = value.slice(-1);
            target.value = value.slice(0, -1);
            target.dispatchEvent(new Event("input", { bubbles: true }));
            wedgeBufferRef.current = prefix;
            wedgeBufferStartedAtRef.current = now - gapMs;
          }
        }
      }

      event.preventDefault();
      event.stopPropagation();
      clearPageTextSelection();
      markScanKey();
      if (!wedgeBufferRef.current) {
        wedgeBufferStartedAtRef.current = now;
      }
      wedgeBufferRef.current += event.key;
      setHearingPreview(wedgeBufferRef.current);
      setCaptureArmed(true);
      scheduleWedgeFlush();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (wedgeFlushTimerRef.current) window.clearTimeout(wedgeFlushTimerRef.current);
      if (partialMergeTimerRef.current) window.clearTimeout(partialMergeTimerRef.current);
    };
  }, [flushPendingPartial, flushWedgeBuffer, markScanKey, scheduleWedgeFlush]);

  useEffect(() => {
    if (queue.length > 0) void drainQueue();
  }, [drainQueue, queue.length]);

  const value = useMemo<StitchScanCaptureValue>(
    () => ({
      inputRef,
      focusInput,
      kioskId,
      setKioskId,
      workstationId,
      setWorkstationId,
      phase,
      message,
      error,
      last,
      openSessions,
      queue,
      log,
      draining,
      captureArmed,
      hearingPreview,
      flushInputNow,
      scheduleFlush,
    }),
    [
      focusInput,
      kioskId,
      setKioskId,
      workstationId,
      setWorkstationId,
      phase,
      message,
      error,
      last,
      openSessions,
      queue,
      log,
      draining,
      captureArmed,
      hearingPreview,
      flushInputNow,
      scheduleFlush,
    ]
  );

  return (
    <StitchScanCaptureContext.Provider value={value}>
      {/* Stable DOM node - never display:none so USB wedge can still target it when armed. */}
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Stitch floor scanner capture"
        tabIndex={-1}
        onBlur={() => {
          // Only reclaim when idle - never yank focus during selection or text editing.
          window.setTimeout(() => {
            if (shouldReclaimFocus()) focusInput();
            else refreshArmedState();
          }, 50);
        }}
        onChange={() => {
          const value = inputRef.current?.value ?? "";
          if (value) setHearingPreview(value);
          scheduleFlush();
        }}
        onKeyDown={(event) => {
          // Backup path if a key reaches the hidden input without the document
          // capture listener (should be rare - document handler owns the wedge).
          if (isWedgeTerminatorKey(event.key)) {
            event.preventDefault();
            if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
            const value = inputRef.current?.value ?? "";
            if (value) flushInputNow();
            else if (pendingPartialRef.current) flushPendingPartial();
            else if (wedgeBufferRef.current) flushWedgeBuffer(true);
          }
        }}
        // Keep focusable (never display:none). Near-zero opacity so USB HID can target it on any tab.
        className="fixed bottom-0 left-0 z-[60] h-px w-px opacity-[0.01] border-0 p-0"
      />
      {children}
    </StitchScanCaptureContext.Provider>
  );
}

function formatLogTime(at: number): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Compact status chip - visible on every stitch floor tab. */
export function StitchScannerReadyBadge({ className }: { className?: string }) {
  const { captureArmed, queue, draining, hearingPreview, focusInput } =
    useStitchScanCapture();

  return (
    <button
      type="button"
      onClick={() => {
        clearPageTextSelection();
        focusInput();
      }}
      className={cn(
        "inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
        hearingPreview
          ? "bg-indigo-50 text-indigo-950 ring-1 ring-indigo-200 hover:bg-indigo-100"
          : captureArmed
            ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100"
            : "bg-amber-50 text-amber-950 ring-1 ring-amber-200 hover:bg-amber-100",
        className
      )}
      title={
        hearingPreview
          ? "Hearing USB scan..."
          : captureArmed
            ? "USB scanner capture armed - rapid scans always captured"
            : "Typing in a field - USB scans still capture; tap to focus scanner"
      }
    >
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          hearingPreview
            ? "bg-indigo-500"
            : captureArmed
              ? "bg-emerald-500"
              : "bg-amber-500"
        )}
      />
      <span>
        {hearingPreview
          ? "Hearing scan..."
          : captureArmed
            ? "Scanner ready"
            : "Field focused"}
      </span>
      {queue.length > 0 && (
        <span className="tabular-nums opacity-80">Queue {queue.length}</span>
      )}
      {draining && <span className="opacity-80">Processing...</span>}
    </button>
  );
}

/**
 * Always-visible last-scan strip so Live/Performance/History show feedback
 * immediately (Processed log previously lived only on the Scan tab).
 */
export function StitchScanFeedbackBanner({
  className,
  onScanSettled,
}: {
  className?: string;
  /** Fired after each processed scan so Live can refresh immediately. */
  onScanSettled?: (row: ScanLogRow) => void;
}) {
  const { log, queue, draining, message, error, captureArmed, hearingPreview } =
    useStitchScanCapture();
  const lastRow = log[0] ?? null;
  const settledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lastRow || !onScanSettled) return;
    const key = `${lastRow.id}-${lastRow.at}`;
    if (settledKeyRef.current === key) return;
    settledKeyRef.current = key;
    onScanSettled(lastRow);
  }, [lastRow, onScanSettled]);

  // Optimistic raw capture - show while keys arrive, before API.
  if (hearingPreview) {
    return (
      <div
        className={cn(
          "rounded-xl border-2 border-indigo-400 bg-indigo-50 px-4 py-3 text-indigo-950",
          className
        )}
      >
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Last scan</p>
        <p className="mt-1 font-mono text-base font-semibold tracking-normal break-all">
          {hearingPreview}
        </p>
        <p className="mt-1 text-sm font-medium">Hearing scan... (not sent yet)</p>
      </div>
    );
  }

  if (!lastRow && queue.length === 0 && !message && !error) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500",
          className
        )}
      >
        {captureArmed
          ? "Scan EMP badge or A4 piece QR - raw code appears here instantly on every tab."
          : "Typing in a field - USB scans still appear here. Tap Scanner ready to focus capture."}
      </div>
    );
  }

  const tone = error
    ? "border-red-300 bg-red-50 text-red-900"
    : lastRow && !lastRow.ok
      ? "border-red-300 bg-red-50 text-red-900"
      : queue.length > 0 || draining
        ? "border-indigo-300 bg-indigo-50 text-indigo-950"
        : "border-emerald-300 bg-emerald-50 text-emerald-950";

  const headline = error
    ? error
    : lastRow
      ? lastRow.message
      : message || (draining ? "Processing scan..." : "Scan captured");

  return (
    <div className={cn("rounded-xl border-2 px-4 py-3", tone, className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Last scan</p>
        {lastRow ? (
          <p className="font-mono text-xs tabular-nums opacity-70">{formatLogTime(lastRow.at)}</p>
        ) : null}
      </div>
      {lastRow ? (
        <p className="mt-1 font-mono text-base font-semibold tracking-normal break-all">
          {lastRow.code}
        </p>
      ) : queue[0] ? (
        <p className="mt-1 font-mono text-base font-semibold tracking-normal break-all">
          {queue[0].code}
        </p>
      ) : null}
      <p className="mt-1 text-sm font-medium">{headline}</p>
      {(queue.length > 0 || draining) && (
        <p className="mt-1 text-xs opacity-80">
          {draining ? "Processing..." : ""}
          {queue.length > 0 ? ` Queue ${queue.length}` : ""}
        </p>
      )}
      {log.length > 1 && (
        <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto border-t border-black/10 pt-2 text-xs">
          {log.slice(1, 6).map((row) => (
            <li
              key={`${row.id}-${row.at}`}
              className={cn(
                "font-mono",
                row.ok ? "text-emerald-900/80" : "text-red-800/90"
              )}
            >
              <span className="tabular-nums opacity-70">{formatLogTime(row.at)}</span>{" "}
              <span className="font-semibold">{row.code}</span> - {row.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
