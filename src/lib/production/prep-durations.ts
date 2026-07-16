import type { FabricPrepStep } from "@/lib/types/production";

/** Lifecycle scan timestamps used purely to display elapsed durations (no timers). */
export type PrepTimestamps = {
  wash_started_at?: string | null;
  dry_started_at?: string | null;
  iron_started_at?: string | null;
  iron_done_at?: string | null;
};

/** Human short duration, e.g. "20m", "3h", "2h 5m", "1d 4h". Never negative. */
export function formatShortDuration(ms: number): string {
  const safe = ms > 0 ? ms : 0;
  const totalMinutes = Math.floor(safe / 60000);
  if (totalMinutes < 1) return "just now";
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

function elapsedFrom(startedAt: string | null | undefined, nowMs: number): string | null {
  if (!startedAt) return null;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;
  return formatShortDuration(nowMs - started);
}

/**
 * Muted label for how long a fabric has been in its CURRENT prep stage, computed
 * from scan timestamps at render time (informational only — never blocking).
 * Returns null when the relevant timestamp is missing (back-compat with old receipts).
 */
export function currentPrepStageElapsedLabel(
  step: FabricPrepStep | null | undefined,
  timestamps: PrepTimestamps,
  nowMs: number = Date.now()
): string | null {
  if (!step) return null;
  switch (step) {
    case "wash": {
      const dur = elapsedFrom(timestamps.wash_started_at, nowMs);
      return dur ? `${dur} in wash` : null;
    }
    case "soak": {
      const dur = elapsedFrom(timestamps.wash_started_at, nowMs);
      return dur ? `${dur} soaking` : null;
    }
    case "drying": {
      const dur = elapsedFrom(timestamps.dry_started_at, nowMs);
      return dur ? `${dur} drying` : null;
    }
    case "iron": {
      const dur = elapsedFrom(timestamps.iron_started_at, nowMs);
      return dur ? `${dur} ironing` : null;
    }
  }
}
