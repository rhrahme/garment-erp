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
import type { SewingKioskScanResult, SewingKioskUiPhase, SewingSession } from "@/lib/types/sewing-sessions";
import { cn } from "@/lib/utils";

const KIOSK_STORAGE_KEY = "hagan-sewing-kiosk-id";
const QUEUE_STORAGE_KEY = "hagan-sewing-scan-queue";
const MAX_LOG = 40;

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

/** True when focus is on a real text field (search, workstation, etc.) - do not steal. */
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

type ProviderProps = {
  children: ReactNode;
  /** Bump when floor tab changes so capture re-arms after navigating away from text fields. */
  rearmKey?: string;
};

export function StitchScanCaptureProvider({ children, rearmKey }: ProviderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const flushTimerRef = useRef<number | null>(null);
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

  useEffect(() => {
    const id = readKioskId();
    setKioskIdState(id);
    kioskIdRef.current = id;
    const restored = loadPersistedQueue();
    queueRef.current = restored;
    setQueue(restored);
  }, []);

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

  const shouldReclaimFocus = useCallback(() => {
    const active = document.activeElement;
    if (active === inputRef.current) return false;
    if (isTextEntryElement(active) && active !== inputRef.current) return false;
    return true;
  }, []);

  const focusInput = useCallback(() => {
    if (!shouldReclaimFocus()) {
      setCaptureArmed(false);
      return;
    }
    inputRef.current?.focus({ preventScroll: true });
    setCaptureArmed(document.activeElement === inputRef.current);
  }, [shouldReclaimFocus]);

  useEffect(() => {
    focusInput();
    const id = window.setInterval(focusInput, 1500);
    return () => window.clearInterval(id);
  }, [focusInput]);

  useEffect(() => {
    focusInput();
  }, [rearmKey, focusInput]);

  useEffect(() => {
    const onFocusIn = () => {
      const active = document.activeElement;
      setCaptureArmed(active === inputRef.current);
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

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
        const data = (await res.json()) as SewingKioskScanResult & { error?: string };
        const ok = Boolean(data.ok ?? res.ok);
        const msg = data.message ?? data.error ?? (ok ? "OK" : "Scan failed");

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
        const msg = err instanceof Error ? err.message : "Scan failed";
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
      focusInput();
    }

    drainingRef.current = false;
    setDraining(false);
    focusInput();
  }, [focusInput, syncQueueState]);

  const captureCodes = useCallback(
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

      const next = [...queueRef.current, ...added];
      syncQueueState(next);
      playBeep("capture");
      focusInput();
      void drainQueue();
    },
    [drainQueue, focusInput, syncQueueState]
  );

  const flushInputNow = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const parts = splitScanInput(el.value);
    el.value = "";
    captureCodes(parts);
  }, [captureCodes]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => {
      flushInputNow();
    }, 60);
  }, [flushInputNow]);

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
      flushInputNow,
      scheduleFlush,
    ]
  );

  return (
    <StitchScanCaptureContext.Provider value={value}>
      {/* Stable DOM node - never display:none so USB wedge can always target it. */}
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Stitch floor scanner capture"
        tabIndex={0}
        onBlur={() => {
          window.setTimeout(focusInput, 50);
        }}
        onChange={scheduleFlush}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
            flushInputNow();
          }
        }}
        // Keep focusable (never display:none). Near-zero opacity so USB HID can target it on any tab.
        className="fixed bottom-0 left-0 z-[60] h-px w-px opacity-[0.01] border-0 p-0"
      />
      {children}
    </StitchScanCaptureContext.Provider>
  );
}

/** Compact status chip - visible on every stitch floor tab. */
export function StitchScannerReadyBadge({ className }: { className?: string }) {
  const { captureArmed, queue, draining, focusInput } = useStitchScanCapture();

  return (
    <button
      type="button"
      onClick={() => focusInput()}
      className={cn(
        "inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
        captureArmed
          ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100"
          : "bg-amber-50 text-amber-950 ring-1 ring-amber-200 hover:bg-amber-100",
        className
      )}
      title="Tap to arm scanner capture"
    >
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          captureArmed ? "bg-emerald-500" : "bg-amber-500"
        )}
      />
      <span>{captureArmed ? "Scanner ready" : "Scanner paused"}</span>
      {queue.length > 0 && (
        <span className="tabular-nums opacity-80">Queue {queue.length}</span>
      )}
      {draining && <span className="opacity-80">Processing...</span>}
    </button>
  );
}
