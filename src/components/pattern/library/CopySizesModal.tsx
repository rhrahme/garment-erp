"use client";

import { X } from "lucide-react";
import { CopySizesForm } from "@/components/pattern/library/CopySizesForm";

/**
 * Modal shell for Copy sizes from Pattern order board / job page.
 */
export function CopySizesModal({
  patternId,
  patternRef,
  garmentType,
  onClose,
}: {
  patternId: string;
  patternRef: string;
  garmentType?: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-sizes-modal-title"
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 id="copy-sizes-modal-title" className="text-base font-semibold text-slate-900">
            Copy sizes
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">
          <CopySizesForm
            patternId={patternId}
            patternRef={patternRef}
            garmentType={garmentType}
          />
        </div>
      </div>
    </div>
  );
}
