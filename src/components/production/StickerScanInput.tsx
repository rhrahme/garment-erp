"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ScanLine } from "lucide-react";
import {
  announceScanError,
  announceScanFeedback,
  scanFeedbackHeadline,
  unlockScanAudio,
} from "@/lib/production/scan-feedback";
import { postStageScan } from "@/lib/production/scan-fetch";
import { splitScanInput } from "@/lib/production/scan-input";
import type { ScanStation, StageScanNotice } from "@/lib/production/stage-scan";

export type StageScanResponse = {
  station: ScanStation;
  message: string;
  client_code: string;
  production_code: string;
  fabric_cut_code: string;
  article_number: number;
  garment_type: string;
  so_number: string;
  piece_name: string;
  fabric_number: string;
  notice?: StageScanNotice;
};

type StickerScanInputProps = {
  station: ScanStation;
  stationLabel: string;
  scanContext?: "fabric-receiving" | "production";
  voiceFeedback?: boolean;
  onSuccess?: (result: StageScanResponse) => void;
  onRefresh?: () => void | Promise<void>;
  autoFocus?: boolean;
};

function formatArticle(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

function resultPanelClass(notice?: StageScanNotice): string {
  if (notice === "already_received") {
    return "border-amber-400 bg-amber-50 text-amber-950";
  }
  if (notice === "created") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  }
  return "border-sky-300 bg-sky-50 text-sky-950";
}

/** Scanner finishes typing a code in about this many ms — then auto-submit. */
const SCAN_BURST_IDLE_MS = 100;

export function StickerScanInput({
  station,
  stationLabel,
  scanContext,
  voiceFeedback = false,
  onSuccess,
  onRefresh,
  autoFocus = true,
}: StickerScanInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const flushTimerRef = useRef<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StageScanResponse | null>(null);
  const scanChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingCountRef = useRef(0);

  const focusInput = useCallback(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    focusInput();
    return () => {
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    };
  }, [focusInput, station]);

  function clearInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function captureAndClearInput(): string {
    const el = inputRef.current;
    if (!el) return "";
    const raw = el.value;
    el.value = "";
    return raw.trim();
  }

  function setProcessingState() {
    setProcessing(pendingCountRef.current > 0);
  }

  function cancelFlushTimer() {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }

  function enqueueOneScan(trimmed: string) {
    if (!trimmed) return;

    pendingCountRef.current += 1;
    setProcessingState();

    scanChainRef.current = scanChainRef.current
      .then(async () => {
        setError(null);

        try {
          const res = await postStageScan({
            code: trimmed,
            station,
            ...(scanContext ? { context: scanContext } : {}),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Scan failed");

          const scanResult = data as StageScanResponse;
          setResult(scanResult);
          void announceScanFeedback({
            station: scanResult.station,
            notice: scanResult.notice,
            article_number: scanResult.article_number,
            fabric_cut_code: scanResult.fabric_cut_code,
            garment_type: scanResult.garment_type,
            fabric_number: scanResult.fabric_number,
            message: scanResult.message,
            voiceEnabled: voiceFeedback,
          });
          onSuccess?.(scanResult);
          void onRefresh?.();
        } catch (err) {
          const message =
            err instanceof Error && err.name === "AbortError"
              ? "Scan timed out — refresh the page and try again."
              : err instanceof Error
                ? err.message
                : "Scan failed";
          setError(message);
          void announceScanError(message, voiceFeedback);
        } finally {
          pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
          setProcessingState();
          if (pendingCountRef.current === 0) {
            clearInput();
            focusInput();
          }
        }
      })
      .catch(() => {
        pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
        setProcessingState();
        if (pendingCountRef.current === 0) {
          clearInput();
          focusInput();
        }
      });
  }

  function submitCaptured(raw: string) {
    cancelFlushTimer();
    const codes = splitScanInput(raw);
    for (const code of codes) {
      enqueueOneScan(code);
    }
  }

  function scheduleFlushFromHiddenInput() {
    cancelFlushTimer();
    flushTimerRef.current = window.setTimeout(() => {
      const raw = captureAndClearInput();
      submitCaptured(raw);
    }, SCAN_BURST_IDLE_MS);
  }

  function primeAudioFromScanner() {
    void unlockScanAudio();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    primeAudioFromScanner();

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const raw = captureAndClearInput();
      submitCaptured(raw);
      return;
    }

    scheduleFlushFromHiddenInput();
  }

  function handleInput() {
    primeAudioFromScanner();
    scheduleFlushFromHiddenInput();
  }

  function handleBlur() {
    if (!autoFocus) return;
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
  }

  const headline = result ? scanFeedbackHeadline(result.notice) : null;
  const isFabricFloor = scanContext === "fabric-receiving";

  return (
    <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50/50 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-indigo-600 p-2.5 text-white">
          <ScanLine className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-slate-900">Scan here — {stationLabel}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {isFabricFloor
              ? "Aim the scanner at the box below. Beeps + short voice — details on screen."
              : "Aim the scanner at the box below. Beeps + voice confirm each scan."}
          </p>

          {/* Scanner target — input is invisible on top; codes never appear as visible text. */}
          <div
            className="relative mt-4 w-full rounded-xl border-2 border-dashed border-indigo-400 bg-white py-10 text-center shadow-sm ring-4 ring-indigo-100"
            onPointerDown={() => void unlockScanAudio()}
          >
            {processing ? (
              <span className="pointer-events-none inline-flex items-center gap-2 text-base font-semibold text-indigo-700">
                <Loader2 className="h-5 w-5 animate-spin" />
                Saving scan…
              </span>
            ) : (
              <span className="pointer-events-none text-base font-semibold text-emerald-700">Ready — scan sticker</span>
            )}
            <input
              ref={inputRef}
              type="text"
              name="sticker-scan"
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onBlur={handleBlur}
              className="absolute inset-0 cursor-default opacity-0"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label={`Scan sticker at ${stationLabel}`}
            />
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-900" role="alert">
              <p className="text-base font-bold uppercase tracking-wide">Scan failed</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {result && (
            <div className={`mt-3 rounded-lg border-2 px-4 py-3 text-sm ${resultPanelClass(result.notice)}`} role="status">
              {headline && <p className="text-lg font-bold uppercase tracking-wide">{headline}</p>}
              <p className="mt-1 font-medium">{result.message}</p>
              <p className="mt-2 text-base font-semibold text-slate-900">
                Art. {formatArticle(result.article_number)}{" "}
                <code className="font-mono text-indigo-900">{result.fabric_cut_code}</code>
              </p>
              <p className="mt-1 text-sm">
                {result.garment_type} · {result.fabric_number} · {result.so_number}
              </p>
              {isFabricFloor && result.notice === "already_received" && (
                <p className="mt-2 text-sm font-medium">
                  Already received — select Wash, Soak, or Iron, then scan again.
                </p>
              )}
              {isFabricFloor && result.notice === "created" && (
                <p className="mt-2 text-sm font-medium">On the work list under Fabric received.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
