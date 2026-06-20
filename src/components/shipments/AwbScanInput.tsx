"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ScanLine } from "lucide-react";
import { normalizeScannerInput } from "@/lib/production/scan-input";
import { StatusBadge } from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

type ScannedShipment = {
  id: string;
  awb_number: string;
  carrier: string;
  po_number: string | null;
  status: string;
  current_location?: string | null;
  latest_event?: string | null;
  latest_event_at?: string | null;
  tracking_url?: string | null;
};

type AwbScanResponse = {
  ok: true;
  awb_number: string;
  found: boolean;
  shipment: ScannedShipment | null;
};

type AwbScanInputProps = {
  onFound?: (awbNumber: string) => void;
  onRefresh?: () => void | Promise<void>;
};

const SCAN_BURST_IDLE_MS = 220;
const MIN_CHARS_BEFORE_IDLE_FLUSH = 6;

export function AwbScanInput({ onFound, onRefresh }: AwbScanInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const flushTimerRef = useRef<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AwbScanResponse | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [typedCharCount, setTypedCharCount] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");

  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    focusInput();
    return () => {
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    };
  }, [focusInput]);

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

  function cancelFlushTimer() {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }

  async function submitScan(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || processing) return;

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/shipments/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan_input: trimmed }),
      });
      const data = (await res.json()) as AwbScanResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "AWB lookup failed");

      setResult(data);
      if (data.found) {
        onFound?.(data.awb_number);
      }
      await onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AWB lookup failed");
    } finally {
      setProcessing(false);
      clearInput();
      focusInput();
    }
  }

  function scheduleFlushFromHiddenInput() {
    cancelFlushTimer();
    flushTimerRef.current = window.setTimeout(() => {
      const raw = captureAndClearInput();
      if (raw.length >= MIN_CHARS_BEFORE_IDLE_FLUSH) {
        void submitScan(raw);
      }
    }, SCAN_BURST_IDLE_MS);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      cancelFlushTimer();
      const raw = captureAndClearInput();
      if (raw) void submitScan(raw);
    }
  }

  function handleInput() {
    setTypedCharCount(inputRef.current?.value.length ?? 0);
    scheduleFlushFromHiddenInput();
  }

  function handleBlur() {
    setIsFocused(false);
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
  }

  function activateScanZone() {
    focusInput();
  }

  function submitManual() {
    const code = normalizeScannerInput(manualCode);
    if (!code) return;
    setManualCode("");
    void submitScan(code);
  }

  const shipment = result?.shipment ?? null;

  return (
    <div className="mb-6 rounded-xl border-2 border-indigo-300 bg-indigo-50/50 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-indigo-600 p-2.5 text-white">
          <ScanLine className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-slate-900">Scan AWB label</h3>
          <p className="mt-1 text-sm text-slate-600">
            USB scanners act like a keyboard — click the dashed box once, then scan the carrier barcode on
            the shipping label.
          </p>

          <div
            className={cn(
              "relative mt-4 w-full cursor-pointer rounded-xl border-2 border-dashed bg-white py-8 text-center shadow-sm transition-colors",
              isFocused
                ? "border-emerald-500 ring-4 ring-emerald-100"
                : "border-indigo-400 ring-4 ring-indigo-100"
            )}
            onPointerDown={activateScanZone}
            onClick={activateScanZone}
            role="button"
            tabIndex={-1}
            aria-label="Activate AWB scanner"
          >
            {processing ? (
              <span className="pointer-events-none inline-flex items-center gap-2 text-base font-semibold text-indigo-700">
                <Loader2 className="h-5 w-5 animate-spin" />
                Looking up AWB…
              </span>
            ) : isFocused ? (
              <span className="pointer-events-none text-base font-semibold text-emerald-700">
                Ready — scan AWB
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
              name="awb-scan"
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              onFocus={() => setIsFocused(true)}
              onBlur={handleBlur}
              className="absolute inset-0 cursor-default opacity-0"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label="Scan AWB tracking number"
            />
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={() => setManualOpen((open) => !open)}
              className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
            >
              {manualOpen ? "Hide manual entry" : "Type AWB manually instead"}
            </button>
            {manualOpen && (
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitManual();
                    }
                  }}
                  placeholder="1234567890 or 176-12345678"
                  className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
                />
                <button
                  type="button"
                  onClick={submitManual}
                  disabled={processing || !manualCode.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Look up
                </button>
              </div>
            )}
          </div>

          {error && (
            <div
              className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-900"
              role="alert"
            >
              <p className="text-base font-bold uppercase tracking-wide">Scan failed</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {result && (
            <div
              className={cn(
                "mt-3 rounded-lg border-2 px-4 py-3 text-sm",
                result.found
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "border-amber-300 bg-amber-50 text-amber-950"
              )}
              role="status"
            >
              <p className="text-lg font-bold uppercase tracking-wide">
                {result.found ? "AWB found" : "AWB not in system"}
              </p>
              <p className="mt-1 font-mono text-base font-semibold">{result.awb_number}</p>
              {shipment ? (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={shipment.status} />
                    <span>{shipment.carrier ?? "—"}</span>
                    {shipment.po_number && (
                      <span className="font-mono text-indigo-800">PO {shipment.po_number}</span>
                    )}
                  </div>
                  {shipment.current_location && (
                    <p>
                      <span className="font-medium">Location:</span> {shipment.current_location}
                    </p>
                  )}
                  {shipment.latest_event && (
                    <p>
                      <span className="font-medium">Latest:</span> {shipment.latest_event}
                      {shipment.latest_event_at
                        ? ` · ${formatDate(shipment.latest_event_at.slice(0, 10))}`
                        : ""}
                    </p>
                  )}
                  {shipment.tracking_url && (
                    <a
                      href={shipment.tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block font-medium text-indigo-700 hover:text-indigo-800"
                    >
                      Open carrier tracking
                    </a>
                  )}
                </div>
              ) : (
                <p className="mt-2">
                  Not tracked yet — add it below with <span className="font-medium">Add AWB</span>, or scan
                  supplier email replies from{" "}
                  <a href="/supplier-inbox" className="font-medium text-indigo-700 hover:text-indigo-800">
                    Supplier Inbox
                  </a>
                  .
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
