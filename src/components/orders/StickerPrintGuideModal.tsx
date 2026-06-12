"use client";

import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  detectStickerPrintPlatform,
  stickerPrintGuide,
  type StickerPrintGuide,
} from "@/lib/production/sticker-print-platform";

type StickerPrintGuideModalProps = {
  open: boolean;
  onClose: () => void;
  filename?: string;
  /** Override auto-detected platform (tests). */
  guide?: StickerPrintGuide;
};

export function StickerPrintGuideModal({
  open,
  onClose,
  filename,
  guide: guideOverride,
}: StickerPrintGuideModalProps) {
  if (!open) return null;

  const guide = guideOverride ?? stickerPrintGuide(detectStickerPrintPlatform());

  return (
    <div
      className="no-print fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sticker-print-guide-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-emerald-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="sticker-print-guide-title" className="text-lg font-semibold text-slate-900">
              PDF downloaded — {guide.headline}
            </h2>
            {filename ? (
              <p className="mt-1 font-mono text-xs text-slate-500">{filename}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close print guide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-slate-700">
          <ol className="list-decimal space-y-3 pl-5">
            {guide.steps.map((step) => (
              <li key={step.title}>
                <p className="font-semibold text-slate-900">{step.title}</p>
                <p className="mt-0.5">{step.detail}</p>
              </li>
            ))}
          </ol>

          {guide.doNot ? (
            <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
              {guide.doNot}
            </p>
          ) : null}

          {guide.fallback ? (
            <p className="mt-3 text-xs text-slate-500">{guide.fallback}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end border-t border-slate-200 px-5 py-4">
          <Button onClick={onClose}>Got it</Button>
        </div>
      </div>
    </div>
  );
}
