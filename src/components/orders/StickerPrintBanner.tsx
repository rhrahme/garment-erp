"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { labelPdfMediaMmLabel, labelRollSizeLabel } from "@/lib/production/label-print-config";
import {
  rememberStickerPrintHeadersHint,
  STICKER_PRINT_HEADERS_HINT,
} from "@/lib/production/print-stickers";

type StickerPrintBannerProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function StickerPrintBanner({ open, onClose, onConfirm }: StickerPrintBannerProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleConfirm = useCallback(() => {
    if (dontShowAgain) rememberStickerPrintHeadersHint();
    onConfirm();
  }, [dontShowAgain, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sticker-print-banner-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-amber-200 bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="sticker-print-banner-title" className="text-base font-semibold text-slate-900">
              Turn off browser headers &amp; footers
            </h2>
            <p className="mt-2 text-sm text-slate-600">{STICKER_PRINT_HEADERS_HINT}</p>
            <p className="mt-2 text-sm text-slate-600">
              Also set <strong>Scale 100%</strong>, <strong>Margins: None</strong>, and driver media{" "}
              <strong>{labelPdfMediaMmLabel()}</strong> ({labelRollSizeLabel()} physical label).
            </p>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Don&apos;t show this again
            </label>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            <Printer className="mr-2 h-4 w-4" />
            Print labels
          </Button>
        </div>
      </div>
    </div>
  );
}
