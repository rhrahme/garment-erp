"use client";

import { useMemo, useState, useEffect } from "react";
import { useStitchScanCapture } from "@/components/production/stitch-scan-capture";
import {
  floorActivityInProgressLabel,
  sewingSessionEmployeeDisplayName,
} from "@/lib/production/sewing-session-status-label";
import type { SewingKioskUiPhase, SewingSession } from "@/lib/types/sewing-sessions";
import { cn } from "@/lib/utils";

function formatElapsed(startedAt: string | null, now: number): string {
  if (!startedAt) return "0:00";
  const sec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatLogTime(at: number): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function phaseCopy(
  phase: SewingKioskUiPhase,
  focusSession: SewingSession | null
): { title: string; hint: string; tone: string } {
  switch (phase) {
    case "identity_armed":
      return {
        title: "Badge armed",
        hint: "Scan the A4 piece QR within 30 seconds",
        tone: "bg-amber-50 border-amber-300 text-amber-950",
      };
    case "piece_armed":
      return {
        title: "Piece armed",
        hint: "Scan your employee badge within 30 seconds",
        tone: "bg-amber-50 border-amber-300 text-amber-950",
      };
    case "piece_open":
      return {
        title: floorActivityInProgressLabel(focusSession?.job_functions),
        hint: "When finished: scan the same A4 QR, then your badge",
        tone: "bg-emerald-50 border-emerald-300 text-emerald-950",
      };
    case "piece_closing":
      return {
        title: "Closing piece",
        hint: "Scan badge or matching A4 to confirm finish",
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

export function StitchKioskPanel() {
  const {
    focusInput,
    kioskId,
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
  } = useStitchScanCapture();

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const highlight =
    last?.session && (last.session.status === "open" || last.session.status === "closing")
      ? last.session
      : openSessions[0] ?? null;

  const copy = phaseCopy(phase, highlight);
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
              <p className="text-lg font-semibold text-slate-900">
                {sewingSessionEmployeeDisplayName(highlight)}
              </p>
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
        <p className="text-sm font-medium text-slate-700">
          Scanner input - always open on every floor tab (scans are queued instantly)
        </p>
        <button
          type="button"
          onClick={() => focusInput()}
          className={cn(
            "mt-2 flex w-full min-h-[56px] items-center justify-center rounded-lg border-2 border-dashed px-4 py-4 text-left text-lg font-mono tracking-wide transition-colors",
            captureArmed
              ? "border-emerald-400 bg-emerald-50/50 text-emerald-900"
              : "border-amber-400 bg-amber-50/50 text-amber-950"
          )}
        >
          {captureArmed
            ? "Armed - scan EMP badge or A4 piece QR"
            : "Field focused - USB scans still capture; tap to focus scanner"}
        </button>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            Kiosk id: <span className="font-mono text-slate-700">{kioskId}</span>
          </span>
          <label className="inline-flex items-center gap-2">
            Workstation (optional)
            <input
              value={workstationId}
              onChange={(event) => setWorkstationId(event.target.value.toUpperCase())}
              data-stitch-manual-entry="true"
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
          <p className="text-sm font-semibold text-slate-900">Open on floor now</p>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {openSessions.map((session) => (
              <li key={session.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-medium text-slate-800">
                  {sewingSessionEmployeeDisplayName(session)}
                </span>
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
                <span className="tabular-nums text-slate-500">{formatLogTime(row.at)}</span>{" "}
                <span className="font-semibold">{row.code}</span> - {row.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
