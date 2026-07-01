"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  EmployeeScanSession,
  stickerScanReady,
} from "@/components/production/EmployeeScanSession";
import { StickerScanInput, type StageScanResponse } from "@/components/production/StickerScanInput";
import {
  readVoiceFeedbackEnabled,
  writeVoiceFeedbackEnabled,
} from "@/lib/production/scan-feedback";
import type { ScanEmployeeSession } from "@/lib/production/scan-employee-session";
import type { ScanStation } from "@/lib/production/stage-scan";
import { cn } from "@/lib/utils";

const STATION_OPTIONS: { id: ScanStation; label: string }[] = [
  { id: "receive", label: "Receive" },
  { id: "wash", label: "Wash" },
  { id: "soak", label: "Soak" },
  { id: "iron", label: "Iron" },
  { id: "cutting", label: "Cutting" },
  { id: "sewing", label: "Sewing" },
  { id: "garment_wash", label: "Garment wash" },
  { id: "finishing", label: "Finishing" },
  { id: "packed", label: "Packed" },
];

type StageScanPanelProps = {
  stations: ScanStation[];
  scanContext?: "fabric-receiving" | "production";
  requireEmployee?: boolean;
  onRefresh?: () => void | Promise<void>;
  onScanMessage?: (message: string) => void;
  onScanResult?: (result: StageScanResponse) => void;
};

export function StageScanPanel({
  stations,
  scanContext,
  requireEmployee = true,
  onRefresh,
  onScanMessage,
  onScanResult,
}: StageScanPanelProps) {
  const options = STATION_OPTIONS.filter((option) => stations.includes(option.id));
  const [station, setStation] = useState<ScanStation>(options[0]?.id ?? "receive");
  const [voiceFeedback, setVoiceFeedback] = useState(true);
  const [employeeSession, setEmployeeSession] = useState<ScanEmployeeSession | null>(null);
  const active = options.find((option) => option.id === station) ?? options[0]!;

  useEffect(() => {
    setVoiceFeedback(readVoiceFeedbackEnabled());
  }, []);

  function toggleVoice() {
    setVoiceFeedback((current) => {
      const next = !current;
      writeVoiceFeedbackEnabled(next);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {requireEmployee && (
        <EmployeeScanSession
          onSessionChange={setEmployeeSession}
          fabricReceivingContext={scanContext === "fabric-receiving"}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {options.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setStation(option.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  station === option.id
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}

        {scanContext === "fabric-receiving" && (
          <button
            type="button"
            onClick={toggleVoice}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-colors",
              voiceFeedback
                ? "bg-white text-indigo-700 ring-indigo-200 hover:bg-indigo-50"
                : "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200"
            )}
            title={voiceFeedback ? "Voice on" : "Voice off — beeps only"}
          >
            {voiceFeedback ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {voiceFeedback ? "Voice on" : "Voice off"}
          </button>
        )}
      </div>

      <StickerScanInput
        station={active.id}
        stationLabel={active.label}
        scanContext={scanContext}
        voiceFeedback={scanContext === "fabric-receiving" && voiceFeedback}
        employeeSession={employeeSession}
        requireEmployee={requireEmployee}
        stickerScanEnabled={!requireEmployee || stickerScanReady(employeeSession)}
        onRefresh={onRefresh}
        onSuccess={(result) => {
          onScanMessage?.(result.message);
          onScanResult?.(result);
        }}
      />
      {scanContext === "fabric-receiving" && (
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-800">Two-step scan:</span> badge first, then fabric sticker. Pick{" "}
          <strong>Receive</strong>, <strong>Wash</strong>, <strong>Soak</strong>, or <strong>Iron</strong> to match
          where the fabric is on the floor.
        </p>
      )}
      {scanContext === "production" && requireEmployee && (
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-800">Two-step scan:</span> badge first, then garment sticker. Session
          lasts 8 hours — sign out when your shift ends.
        </p>
      )}
    </div>
  );
}
