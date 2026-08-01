"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeScannerInput, splitScanInput } from "@/lib/production/scan-input";
import type { SewingKioskScanResult, SewingKioskUiPhase, SewingSession } from "@/lib/types/sewing-sessions";
import { cn } from "@/lib/utils";

const KIOSK_STORAGE_KEY = "hagan-sewing-kiosk-id";
const QUEUE_STORAGE_KEY = "hagan-sewing-scan-queue";
const MAX_LOG = 40;

type QueuedScan = {
  id: string;
  code: string;
  captured_at: number;
};

type ScanLogRow = {
  id: string;
  code: string;
  ok: boolean;
  message: string;
  at: number;
};

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

function formatElapsed(startedAt: string | null, now: number): string {
  if (!startedAt) return "0:00";
  const sec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function phaseCopy(phase: SewingKioskUiPhase): { title: string; hint: string; tone: string } {
  switch (phase) {
    case "identity_armed":
      return {
        title: "Badge armed",
        hint: "Scan the A4 piece QR within 30 seconds",
        tone: "bg-amber-50 border-amber-300 text-amber-950",
      };
    case "piece_open":
      return {
        title: "Sewing in progress",
        hint: "When finished: scan the same A4 QR, then your badge",
        tone: "bg-emerald-50 border-emerald-300 text-emerald-950",
      };
    case "piece_closing":
      return {
        title: "Closing piece",
        hint: "Scan your employee badge to confirm finish",
        tone: "bg-sky-50 border-sky-300 text-sky-950",
      };
    default:
      return {
        title: "Ready - keep scanning",
        hint: "All scans are recorded instantly, then processed in order",
        tone: "bg-slate-50 border-slate-300 text-slate-900",
      };
  }
}

function playBeep(kind: "ok" | "error" | "progress" | "capture") {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value =
      kind === "error" ? 220 : kind === "capture" ? 1200 : kind === "progress" ? 520 : 880;
    gain.gain.value = 0.04;
    osc.start();
    osc.stop(ctx.currentTime + (kind === "error" ? 0.22 : kind === "capture" ? 0.05 : 0.1));
  } catch {
    /* ignore */
  }
}

export function StitchKioskPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const flushTimerRef = useRef<number | null>(null);
  const queueRef = useRef<QueuedScan[]>([]);
  const drainingRef = useRef(false);
  const kioskIdRef = useRef("laptop-1");
  const workstationRef = useRef("");

  const [kioskId, setKioskId] = useState("laptop-1");
  const [workstationId, setWorkstationId] = useState("");
  const [phase, setPhase] = useState<SewingKioskUiPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<SewingKioskScanResult | null>(null);
  const [openSessions, setOpenSessions] = useState<SewingSession[]>([]);
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const [log, setLog] = useState<ScanLogRow[]>([]);
  const [draining, setDraining] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = readKioskId();
    setKioskId(id);
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

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    focusInput();
    const id = window.setInterval(focusInput, 1500);
    return () => window.clearInterval(id);
  }, [focusInput]);

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

      // Drop from front only after attempt (never lose capture; failed still consumed + logged)
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

      // Instant record - never wait for API
      const next = [...queueRef.current, ...added];
      syncQueueState(next);
      playBeep("capture");
      focusInput();
      void drainQueue();
    },
    [drainQueue, focusInput, syncQueueState]
  );

  function flushInputNow() {
    const el = inputRef.current;
    if (!el) return;
    const parts = splitScanInput(el.value);
    el.value = "";
    captureCodes(parts);
  }

  function scheduleFlush() {
    if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => {
      flushInputNow();
    }, 60);
  }

  // Resume drain after restore
  useEffect(() => {
    if (queue.length > 0) void drainQueue();
  }, [drainQueue, queue.length]);

  const copy = phaseCopy(phase);
  const highlight =
    last?.session && (last.session.status === "open" || last.session.status === "closing")
      ? last.session
      : openSessions[0] ?? null;

  const elapsed = useMemo(
    () => formatElapsed(highlight?.started_at ?? null, now),
    [highlight?.started_at, now]
  );

  return (
    <div className="space-y-4">
      <div className={cn("rounded-2xl border-2 px-6 py-8 text-center", copy.tone)}>
        <p className="text-sm font-semibold uppercase tracking-wide opacity-70">Stitch kiosk</p>
        <h2 className="mt-2 text-3xl font-bold sm:text-4xl">{copy.title}</h2>
        <p className="mt-3 text-lg font-medium opacity-90">{copy.hint}</p>

        <div className="mt-5 flex flex-wrap justify-center gap-3 text-sm">
          <span className="rounded-full bg-white/80 px-3 py-1 font-semibold tabular-nums text-slate-800">
            Queue: {queue.length}
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1 font-semibold tabular-nums text-slate-800">
            Open: {openSessions.length}
          </span>
          {draining && (
            <span className="rounded-full bg-indigo-100 px-3 py-1 font-semibold text-indigo-800">
              Processing queue...
            </span>
          )}
        </div>

        {highlight && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/70 px-4 py-3">
              <p className="text-xs uppercase text-slate-500">Last / focus</p>
              <p className="text-lg font-semibold text-slate-900">{highlight.employee_name}</p>
            </div>
            <div className="rounded-xl bg-white/70 px-4 py-3">
              <p className="text-xs uppercase text-slate-500">Piece</p>
              <p className="text-lg font-semibold text-slate-900">
                {highlight.production_code}
                {highlight.piece_mark ? ` - ${highlight.piece_mark}` : ""}
              </p>
            </div>
            <div className="rounded-xl bg-white/70 px-4 py-3">
              <p className="text-xs uppercase text-slate-500">Elapsed</p>
              <p className="text-3xl font-bold tabular-nums text-slate-900">{elapsed}</p>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">
          Scanner input - always open (scans are queued instantly)
        </label>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
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
          className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-4 text-lg font-mono tracking-wide outline-none ring-indigo-500 focus:ring-2"
          placeholder="Scan EMP badge or A4 piece QR - many stitchers OK..."
        />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            Kiosk id: <span className="font-mono text-slate-700">{kioskId}</span>
          </span>
          <label className="inline-flex items-center gap-2">
            Workstation (optional)
            <input
              value={workstationId}
              onChange={(event) => setWorkstationId(event.target.value.toUpperCase())}
              placeholder="PL-3-5"
              className="w-28 rounded border border-slate-200 px-2 py-1 font-mono"
            />
          </label>
        </div>
      </div>

      {queue.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <p className="text-sm font-semibold text-indigo-900">
            Captured - waiting to process ({queue.length})
          </p>
          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto font-mono text-xs text-indigo-800">
            {queue.slice(0, 12).map((item) => (
              <li key={item.id}>{item.code}</li>
            ))}
            {queue.length > 12 && <li>... +{queue.length - 12} more</li>}
          </ul>
        </div>
      )}

      {openSessions.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Open sewing now</p>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {openSessions.map((session) => (
              <li key={session.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-medium text-slate-800">{session.employee_name}</span>
                <span className="font-mono text-slate-600">
                  {session.production_code}
                  {session.status === "closing" ? " (closing)" : ""}
                </span>
                <span className="tabular-nums text-slate-500">
                  {formatElapsed(session.started_at, now)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {message && !error && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      )}

      {log.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Processed log</p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
            {log.map((row) => (
              <li
                key={`${row.id}-${row.at}`}
                className={cn(
                  "rounded px-2 py-1 font-mono",
                  row.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"
                )}
              >
                <span className="font-semibold">{row.code}</span> - {row.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
