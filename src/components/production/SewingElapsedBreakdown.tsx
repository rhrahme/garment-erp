"use client";

import {
  sewingSessionElapsedBreakdown,
  type SewingElapsedBreakdown,
  type SewingPauseIntervalLike,
} from "@/lib/production/sewing-session-state";
import { cn } from "@/lib/utils";

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "-";
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatClockShort(iso: string | null | undefined): string {
  if (!iso) return "now";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function buildSewingElapsedBreakdown(
  startedAt: string | null | undefined,
  endAt: number,
  pauses: SewingPauseIntervalLike[] = []
): SewingElapsedBreakdown | null {
  if (!startedAt) return null;
  return sewingSessionElapsedBreakdown(startedAt, endAt, pauses);
}

type SewingElapsedBreakdownViewProps = {
  startedAt: string | null | undefined;
  endAt: number;
  pauses?: SewingPauseIntervalLike[];
  /** Prefer a stored closed duration when there were no pause overlaps. */
  fallbackSec?: number | null;
  longRunning?: boolean;
  frozen?: boolean;
  compact?: boolean;
  className?: string;
};

/**
 * Work total plus before/lunch/after segments when a kiosk pause overlapped.
 */
export function SewingElapsedBreakdownView({
  startedAt,
  endAt,
  pauses = [],
  fallbackSec = null,
  longRunning = false,
  frozen = false,
  compact = false,
  className,
}: SewingElapsedBreakdownViewProps) {
  const breakdown = buildSewingElapsedBreakdown(startedAt, endAt, pauses);
  const workSec = breakdown?.work_sec ?? fallbackSec ?? 0;
  const showSegments = Boolean(
    breakdown && breakdown.pause_sec > 0 && breakdown.segments.length > 1
  );

  return (
    <div className={cn(className)}>
      <div
        className={cn(
          "tabular-nums font-semibold",
          compact ? "text-base" : "text-lg",
          longRunning ? "text-red-700" : "text-slate-900"
        )}
      >
        {formatDuration(workSec)}
        {frozen ? (
          <div className="mt-1 text-xs font-semibold text-amber-800">Frozen</div>
        ) : null}
      </div>
      {showSegments && breakdown ? (
        <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
          {breakdown.segments.map((seg, index) => (
            <li
              key={`${seg.kind}-${seg.started_at}-${index}`}
              className={cn(
                "flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5",
                seg.kind === "pause" && "text-amber-800"
              )}
            >
              <span className="font-medium">
                {seg.label}
                <span className="ml-1 font-normal text-slate-500">
                  {formatClockShort(seg.started_at)}
                  {"-"}
                  {formatClockShort(seg.ended_at)}
                </span>
              </span>
              <span className="tabular-nums">
                {formatDuration(seg.sec)}
                {seg.kind === "pause" ? " off" : ""}
              </span>
            </li>
          ))}
          <li className="flex justify-between gap-2 border-t border-slate-100 pt-0.5 font-semibold text-slate-700">
            <span>Work total</span>
            <span className="tabular-nums">{formatDuration(breakdown.work_sec)}</span>
          </li>
        </ul>
      ) : null}
      {longRunning ? (
        <div className="mt-1 text-xs font-semibold text-red-800">Long running</div>
      ) : null}
    </div>
  );
}
