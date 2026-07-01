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
import { normalizeScannerInput, splitScanInput } from "@/lib/production/scan-input";
import type { ScanEmployeeSession } from "@/lib/production/scan-employee-session";
import { effectiveWorkstationId } from "@/lib/production/scan-employee-session";
import type { ScanStation, StageScanNotice } from "@/lib/production/stage-scan";
import { cn } from "@/lib/utils";

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
  employeeSession?: ScanEmployeeSession | null;
  requireEmployee?: boolean;
  stickerScanEnabled?: boolean;
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

/** Wireless USB scanners often need a longer gap before auto-submit (no Enter suffix). */
const SCAN_BURST_IDLE_MS = 220;
/** Avoid flushing partial codes when the wireless link pauses mid-burst. */
const MIN_CHARS_BEFORE_IDLE_FLUSH = 8;

export function StickerScanInput({
  station,
  stationLabel,
  scanContext,
  voiceFeedback = false,
  employeeSession = null,
  requireEmployee = true,
  stickerScanEnabled = true,
  onSuccess,
  onRefresh,
  autoFocus = true,
}: StickerScanInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const flushTimerRef = useRef<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StageScanResponse | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [typedCharCount, setTypedCharCount] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const scanChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingCountRef = useRef(0);

  const focusInput = useCallback(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    if (stickerScanEnabled) focusInput();
    return () => {
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    };
  }, [focusInput, station, stickerScanEnabled]);

  function clearInput() {
    if (inputRef.current) inputRef.current.value = "";
    setTypedCharCount(0);
  }

  function captureAndClearInput(): string {
    const el = inputRef.current;
    if (!el) return "";
    const raw = normalizeScannerInput(el.value);
    el.value = "";
    setTypedCharCount(0);
    return raw;
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
    const code = normalizeScannerInput(trimmed);
    if (!code) return;

    pendingCountRef.current += 1;
    setProcessingState();

    scanChainRef.current = scanChainRef.current
      .then(async () => {
        setError(null);

        try {
          const res = await postStageScan({
            code,
            station,
            ...(scanContext ? { context: scanContext } : {}),
            ...(requireEmployee && employeeSession
              ? {
                  employee_id: employeeSession.employee_id,
                  workstation_id: effectiveWorkstationId(employeeSession),
                }
              : {}),
            require_employee: requireEmployee,
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
      const el = inputRef.current;
      if (!el) return;
      const pending = normalizeScannerInput(el.value);
      if (pending.length < MIN_CHARS_BEFORE_IDLE_FLUSH) return;
      const raw = captureAndClearInput();
      submitCaptured(raw);
    }, SCAN_BURST_IDLE_MS);
  }

  function activateScanZone() {
    void unlockScanAudio();
    focusInput();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    void unlockScanAudio();

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const raw = captureAndClearInput();
      submitCaptured(raw);
      return;
    }

    if (event.key.length === 1) {
      window.setTimeout(() => {
        setTypedCharCount(inputRef.current?.value.length ?? 0);
      }, 0);
    }

    scheduleFlushFromHiddenInput();
  }

  function handleInput() {
    void unlockScanAudio();
    setTypedCharCount(inputRef.current?.value.length ?? 0);
    scheduleFlushFromHiddenInput();
  }

  function handleBlur() {
    setIsFocused(false);
    if (!autoFocus) return;
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
  }

  function submitManual() {
    const code = normalizeScannerInput(manualCode);
    if (!code) return;
    setManualCode("");
    enqueueOneScan(code);
  }

  const headline = result ? scanFeedbackHeadline(result.notice) : null;
  const isFabricFloor = scanContext === "fabric-receiving";
  const waitingForBadge = requireEmployee && !employeeSession;
  const waitingForStation = requireEmployee && employeeSession && !stickerScanEnabled;

  return (
    <div
      className={cn(
        "rounded-xl border-2 p-5",
        waitingForBadge || waitingForStation
          ? "border-slate-200 bg-slate-50/80 opacity-90"
          : "border-indigo-300 bg-indigo-50/50"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "rounded-lg p-2.5 text-white",
            waitingForBadge || waitingForStation ? "bg-slate-400" : "bg-indigo-600"
          )}
        >
          <ScanLine className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-slate-900">
            {waitingForBadge
              ? "Step 2 — Scan garment sticker"
              : waitingForStation
                ? "Step 2 — Confirm station first"
                : `Step 2 — Scan here — ${stationLabel}`}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {waitingForBadge
              ? "Scan your employee badge above to unlock sticker scanning."
              : waitingForStation
                ? "Pick your workstation above, then scan the garment sticker."
                : isFabricFloor
                  ? "USB scanners act like a keyboard — click the dashed box once, then scan. Beeps + voice confirm."
                  : "Click the dashed box once, then scan the sticker QR."}
          </p>

          <div
            className={cn(
              "relative mt-4 w-full rounded-xl border-2 border-dashed bg-white py-10 text-center shadow-sm transition-colors",
              waitingForBadge || waitingForStation
                ? "cursor-not-allowed border-slate-200 opacity-60"
                : "cursor-pointer",
              !waitingForBadge &&
                !waitingForStation &&
                (isFocused
                  ? "border-emerald-500 ring-4 ring-emerald-100"
                  : "border-indigo-400 ring-4 ring-indigo-100")
            )}
            onPointerDown={waitingForBadge || waitingForStation ? undefined : activateScanZone}
            onClick={waitingForBadge || waitingForStation ? undefined : activateScanZone}
            role="button"
            tabIndex={waitingForBadge || waitingForStation ? -1 : -1}
            aria-label={`Activate scanner for ${stationLabel}`}
            aria-disabled={Boolean(waitingForBadge || waitingForStation)}
          >
            {processing ? (
              <span className="pointer-events-none inline-flex items-center gap-2 text-base font-semibold text-indigo-700">
                <Loader2 className="h-5 w-5 animate-spin" />
                Saving scan…
              </span>
            ) : waitingForBadge || waitingForStation ? (
              <span className="pointer-events-none text-base font-semibold text-slate-500">Waiting for step 1…</span>
            ) : isFocused ? (
              <span className="pointer-events-none text-base font-semibold text-emerald-700">
                Ready — scan sticker
                {typedCharCount > 0 ? (
                  <span className="mt-1 block text-xs font-normal text-emerald-600">
                    Receiving {typedCharCount} characters…
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="pointer-events-none text-base font-semibold text-amber-700">
                Click here, then scan
              </span>
            )}
            <input
              ref={inputRef}
              type="text"
              name="sticker-scan"
              disabled={Boolean(waitingForBadge || waitingForStation)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onFocus={() => setIsFocused(true)}
              onBlur={handleBlur}
              className="absolute inset-0 cursor-default opacity-0 disabled:cursor-not-allowed"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label={`Scan sticker at ${stationLabel}`}
            />
          </div>

          {isFabricFloor && (
            <p className="mt-2 text-xs text-slate-500">
              Scanner not working? Open Notepad and scan — if text appears there, click the dashed box above and try
              again. Set the scanner to <strong>USB keyboard (HID)</strong> mode with <strong>Enter</strong> suffix.
            </p>
          )}

          <div className="mt-3">
            <button
              type="button"
              onClick={() => setManualOpen((open) => !open)}
              className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
            >
              {manualOpen ? "Hide manual entry" : "Type code manually instead"}
            </button>
            {manualOpen && (
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitManual();
                    }
                  }}
                  placeholder="FR-0226-0024/ 0109-L32"
                  className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
                />
                <button
                  type="button"
                  onClick={submitManual}
                  disabled={processing || !manualCode.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Submit
                </button>
              </div>
            )}
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
