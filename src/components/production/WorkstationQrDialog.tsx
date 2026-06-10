"use client";

import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { workstationScanUrl } from "@/lib/production/factory-workstations";
import { qrImageUrl } from "@/lib/production/qr-labels";
import type { FactoryWorkstation } from "@/lib/production/factory-workstations";

export function WorkstationQrDialog({
  workstation,
  onClose,
  onOpenPdfPreview,
}: {
  workstation: FactoryWorkstation;
  onClose: () => void;
  onOpenPdfPreview?: () => void;
}) {
  const scanUrl = workstationScanUrl(workstation.id);
  const qrSrc = qrImageUrl(scanUrl, 160);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
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
  }, [handleClose]);

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workstation-qr-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id="workstation-qr-title" className="text-lg font-semibold text-slate-900">
              {workstation.id}
            </p>
            <p className="text-sm text-slate-600">{workstation.label}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            alt={`QR for ${workstation.id}`}
            width={160}
            height={160}
            className="rounded-lg border border-slate-200"
          />
        </div>

        <p className="mt-3 break-all text-center font-mono text-[10px] text-slate-500">{scanUrl}</p>

        <div className="mt-4 flex flex-col gap-2">
          <Link href={`/production/workstation/${workstation.id}`}>
            <Button type="button" variant="secondary" className="w-full" size="sm">
              Open workstation page
            </Button>
          </Link>
          {onOpenPdfPreview ? (
            <Button type="button" variant="secondary" className="w-full" size="sm" onClick={onOpenPdfPreview}>
              Print all placards (PDF)
            </Button>
          ) : (
            <a href="/api/factory/workstations?format=pdf" target="_blank" rel="noreferrer">
              <Button type="button" variant="secondary" className="w-full" size="sm">
                Print all placards (PDF)
              </Button>
            </a>
          )}
          <Button type="button" variant="ghost" className="w-full" size="sm" onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}
