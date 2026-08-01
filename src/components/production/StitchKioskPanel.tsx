"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeScannerInput, splitScanInput } from "@/lib/production/scan-input";
import type { SewingKioskScanResult, SewingKioskUiPhase } from "@/lib/types/sewing-sessions";
import { cn } from "@/lib/utils";

const KIOSK_STORAGE_KEY = "hagan-sewing-kiosk-id";

function readKioskId(): string {
  if (typeof window === "undefined") return "laptop-1";
  const existing = window.localStorage.getItem(KIOSK_STORAGE_KEY)?.trim();
  if (existing) return existing;
  const generated = `laptop-${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(KIOSK_STORAGE_KEY, generated);
  return generated;
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
        title: "Waiting for stitcher",
        hint: "1) Scan employee badge  2) Scan A4 piece QR",
        tone: "bg-slate-50 border-slate-300 text-slate-900",
      };
  }
}

function playBeep(kind: "ok" | "error" | "progress") {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = kind === "error" ? 220 : kind === "progress" ? 520 : 880;
    gain.gain.value = 0.05;
    osc.start();
    osc.stop(ctx.currentTime + (kind === "error" ? 0.25 : 0.12));
  } catch {
    /* ignore */
  }
}

export function StitchKioskPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const flushTimerRef = useRef<number | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const [kioskId, setKioskId] = useState("laptop-1");
  const [workstationId, setWorkstationId] = useState("");
  const [phase, setPhase] = useState<SewingKioskUiPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<SewingKioskScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setKioskId(readKioskId());
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    focusInput();
    const id = window.setInterval(focusInput, 2000);
    return () => window.clearInterval(id);
  }, [focusInput]);

  const copy = phaseCopy(phase);
  const openSession =
    last?.session && (last.session.status === "open" || last.session.status === "closing")
      ? last.session
      : null;

  const elapsed = useMemo(
    () => formatElapsed(openSession?.started_at ?? null, now),
    [openSession?.started_at, now]
  );

  async function postScan(raw: string) {
    const res = await fetch("/api/production/sewing-session/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw,
        kiosk_id: kioskId,
        workstation_id: workstationId.trim() || null,
      }),
    });
    const data = (await res.json()) as SewingKioskScanResult & { error?: string };
    if (!res.ok && !data.phase) {
      throw new Error(data.error ?? data.message ?? "Scan failed");
    }
    return data;
  }

  function enqueueScan(raw: string) {
    const code = normalizeScannerInput(raw);
    if (!code) return;

    chainRef.current = chainRef.current.then(async () => {
      setProcessing(true);
      setError(null);
      try {
        const data = await postScan(code);
        setLast(data);
        setPhase(data.phase);
        setMessage(data.message);
        if (!data.ok) setError(data.message);
        playBeep(data.beep);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Scan failed";
        setError(msg);
        playBeep("error");
      } finally {
        setProcessing(false);
        focusInput();
      }
    });
  }

  function scheduleFlush() {
    if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      const parts = splitScanInput(el.value);
      el.value = "";
      for (const part of parts) enqueueScan(part);
    }, 80);
  }

  return (
    <div className="space-y-4">
      <div className={cn("rounded-2xl border-2 px-6 py-8 text-center", copy.tone)}>
        <p className="text-sm font-semibold uppercase tracking-wide opacity-70">Stitch kiosk</p>
        <h2 className="mt-2 text-3xl font-bold sm:text-4xl">{copy.title}</h2>
        <p className="mt-3 text-lg font-medium opacity-90">{copy.hint}</p>

        {openSession && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/70 px-4 py-3">
              <p className="text-xs uppercase text-slate-500">Stitcher</p>
              <p className="text-lg font-semibold text-slate-900">{openSession.employee_name}</p>
            </div>
            <div className="rounded-xl bg-white/70 px-4 py-3">
              <p className="text-xs uppercase text-slate-500">Piece</p>
              <p className="text-lg font-semibold text-slate-900">
                {openSession.production_code}
                {openSession.piece_mark ? ` - ${openSession.piece_mark}` : ""}
              </p>
            </div>
            <div className="rounded-xl bg-white/70 px-4 py-3">
              <p className="text-xs uppercase text-slate-500">Elapsed</p>
              <p className="text-3xl font-bold tabular-nums text-slate-900">{elapsed}</p>
            </div>
          </div>
        )}

        {last?.arm && phase === "identity_armed" && (
          <p className="mt-4 text-base font-semibold">
            {last.arm.employee_name} - waiting for A4 QR
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">
          Scanner input (USB wedge - keep this focused)
        </label>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={processing}
          onFocus={() => {}}
          onBlur={() => {
            window.setTimeout(focusInput, 50);
          }}
          onChange={scheduleFlush}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
              const el = inputRef.current;
              if (!el) return;
              const parts = splitScanInput(el.value);
              el.value = "";
              for (const part of parts) enqueueScan(part);
            }
          }}
          className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-4 text-lg font-mono tracking-wide outline-none ring-indigo-500 focus:ring-2"
          placeholder="Scan EMP badge or A4 piece QR..."
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
          {processing && <span className="text-indigo-600">Processing...</span>}
        </div>
      </div>

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
    </div>
  );
}
