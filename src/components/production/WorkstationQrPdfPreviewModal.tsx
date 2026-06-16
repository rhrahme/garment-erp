"use client";

import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

const WORKSTATION_QR_PDF_URL = "/api/factory/workstations?format=pdf";

type WorkstationQrPdfPreviewModalProps = {
  open: boolean;
  onClose: () => void;
};

export function WorkstationQrPdfPreviewModal({ open, onClose }: WorkstationQrPdfPreviewModalProps) {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workstation-qr-pdf-preview-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        className="mx-auto flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="workstation-qr-pdf-preview-title" className="text-lg font-semibold text-slate-900">
              Workstation QR placards
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              A4 landscape sheet — 72 QR codes (8 production lines × 9 machines). Print and place one placard on each sewing machine.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close PDF preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 bg-slate-100">
          <iframe
            title="Workstation QR placards PDF preview"
            src={WORKSTATION_QR_PDF_URL}
            className="h-[min(70vh,720px)] w-full border-0 bg-white"
          />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-500">Press Esc, click outside, or use Close.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <a href={WORKSTATION_QR_PDF_URL} target="_blank" rel="noreferrer">
              <Button type="button" variant="secondary">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in new tab
              </Button>
            </a>
            <Button type="button" onClick={handleClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
