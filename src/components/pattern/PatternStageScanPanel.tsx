"use client";

import { StageScanPanel } from "@/components/production/StageScanPanel";
import type { ScanStation } from "@/lib/production/stage-scan";

const PATTERN_STATIONS: ScanStation[] = [
  "pattern_tud_ready",
  "pattern_sheet_filled",
  "pattern_handed_to_cut",
  "pattern_trial_done",
];

type PatternStageScanPanelProps = {
  onRefresh?: () => void | Promise<void>;
};

/**
 * Pattern-floor scan: manufacturing QRs from the A4 size sheet mark Pattern progress.
 * Cutter/stitcher production stations are unchanged.
 */
export function PatternStageScanPanel({ onRefresh }: PatternStageScanPanelProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
      <div>
        <h3 className="font-semibold text-slate-900">Pattern stage scan</h3>
        <p className="mt-0.5 text-sm text-slate-500">Scan a QR from the printed A4 sheet.</p>
      </div>
      <StageScanPanel
        stations={PATTERN_STATIONS}
        scanContext="pattern"
        requireEmployee={false}
        showEmployeeBadge={false}
        onRefresh={onRefresh}
      />
    </section>
  );
}
