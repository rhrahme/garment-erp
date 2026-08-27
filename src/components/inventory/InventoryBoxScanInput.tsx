"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseInventoryBoxScan } from "@/lib/inventory/box-scan";

const SCAN_BURST_IDLE_MS = 220;
const MIN_CHARS_BEFORE_IDLE_FLUSH = 6;

/**
 * USB scanner target on Inventory -> Boxes. Opening a box adds its
 * written quantity to stock. A second scan never double-adds.
 */
export function InventoryBoxScanInput() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const flushTimerRef = useRef<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [focused, setFocused] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  }

  async function submitScan(raw: string) {
    const boxId = parseInventoryBoxScan(raw);
    if (!boxId || processing) return;
    setProcessing(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/inventory/cartons/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan_input: boxId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        opened?: boolean;
        item?: { name?: string; quantity_on_hand?: number; unit?: string };
        carton?: { quantity?: number };
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not open that box.");
      const unit = data.item?.unit ?? "pcs";
      const name = data.item?.name ?? "item";
      if (data.opened) {
        setMessage(
          `Box opened. ${data.carton?.quantity ?? ""} ${unit} of ${name} added. Stock now ${
            data.item?.quantity_on_hand ?? ""
          } ${unit}.`
        );
      } else {
        setMessage(`Already opened. ${name} was not added again.`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that box.");
    } finally {
      setProcessing(false);
      clearInput();
      focusInput();
    }
  }

  function scheduleFlush() {
    if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => {
      const raw = inputRef.current?.value ?? "";
      if (raw.trim().length >= MIN_CHARS_BEFORE_IDLE_FLUSH) {
        void submitScan(raw);
      }
    }, SCAN_BURST_IDLE_MS);
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4">
      <h3 className="text-sm font-semibold text-indigo-950">Scan here when you open a box</h3>
      <p className="mt-1 text-xs text-indigo-800">
        Click the dashed box once, then scan the sticker QR. Stock goes up by the amount written
        on that box.
      </p>
      <button
        type="button"
        onClick={focusInput}
        className={`relative mt-3 flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-sm font-medium ${
          focused
            ? "border-indigo-600 bg-white text-indigo-800"
            : "border-indigo-300 bg-white/70 text-indigo-700"
        }`}
      >
        <span>{processing ? "Opening..." : focused ? "Ready - scan the box QR" : "Click here, then scan"}</span>
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          aria-label="Scan box QR"
          className="absolute h-px w-px opacity-0"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={scheduleFlush}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submitScan(inputRef.current?.value ?? "");
            }
          }}
        />
      </button>
      <button
        type="button"
        onClick={() => setManualOpen((open) => !open)}
        className="mt-2 text-xs font-medium text-indigo-700 hover:text-indigo-900"
      >
        Type code manually instead
      </button>
      {manualOpen ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submitScan(manualCode);
            setManualCode("");
          }}
        >
          <input
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder="Box id or sticker URL"
            className="flex-1 rounded-md border border-indigo-200 bg-white px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={processing || !manualCode.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Open
          </button>
        </form>
      ) : null}
      {message ? <p className="mt-3 text-sm font-medium text-emerald-800">{message}</p> : null}
      {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
    </div>
  );
}
