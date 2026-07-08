"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LabelPrinterSettingsControl } from "@/components/orders/LabelRotationControl";
import { StickerCell } from "@/components/orders/StickerCell";
import { useLabelRotation } from "@/hooks/useLabelRotation";
import { useLabelScale } from "@/hooks/useLabelScale";
import type { StickerPreviewItem } from "@/lib/production/sticker-print-selection";
import { labelRollHeightCss, labelRollWidthCss, LABEL_ROLL_HEIGHT_MM, LABEL_ROLL_WIDTH_MM } from "@/lib/production/label-print-config";
import {
  detectStickerPrintPlatform,
  stickerPrintGuide,
} from "@/lib/production/sticker-print-platform";
import {
  STICKER_PRINT_PAPER_NOTE,
  STICKER_PRINT_SCALE_NOTE,
} from "@/lib/production/sticker-print-html";
import {
  buildStickerPngUrl,
  downloadStickerPdf,
  downloadStickerPng,
  STICKER_PRINT_HEADERS_HINT,
  type StickerPdfSheet,
} from "@/lib/production/print-stickers";
import type { LabelPrintMode, LabelScalePct } from "@/lib/production/label-printer-settings";
import { PRINTING_FREE } from "@/lib/sales-orders/print-mode";

type StickerPrintPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  onPrint: (selectedCodes: string[]) => void;
  items: StickerPreviewItem[];
  /** Defaults to all items when omitted; pass unprinted sticker codes for incremental print. */
  defaultSelectedCodes?: string[];
  title?: string;
  printing?: boolean;
  orderId: string;
  sheet?: StickerPdfSheet;
  po?: string;
  poId?: string;
};

function PreviewCard({
  item,
  checked,
  onToggle,
  orderId,
  sheet,
  po,
  poId,
  rotation,
  scalePct,
  token,
}: {
  item: StickerPreviewItem;
  checked: boolean;
  onToggle: (code: string, next: boolean) => void;
  orderId: string;
  sheet: StickerPdfSheet;
  po?: string;
  poId?: string;
  rotation: LabelPrintMode;
  scalePct: LabelScalePct;
  /** Per-open cache-bust token so preview reflects the latest render, never a stale asset. */
  token: string;
}) {
  const { label, role } = item;
  const code = label.sticker_code;
  const previewScale = 0.42;
  const [imgFailed, setImgFailed] = useState(false);

  // Render the EXACT server raster (the same bitmap embedded in the print PDF), so the
  // preview is pixel-identical to what prints. Falls back to the HTML StickerCell only if
  // the image fails to load (e.g. session expired).
  const pngUrl = useMemo(
    () =>
      buildStickerPngUrl(
        { orderId, sheet, po, poId, codes: [code], rotationDeg: rotation, scalePct },
        { cacheBust: token }
      ),
    [orderId, sheet, po, poId, code, rotation, scalePct, token]
  );

  return (
    <label
      className={`flex cursor-pointer flex-col rounded-xl border bg-white shadow-sm transition-colors ${
        checked ? "border-emerald-300 ring-1 ring-emerald-200" : "border-slate-200 opacity-60"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onToggle(code, event.target.checked)}
          className="h-4 w-4 shrink-0 rounded border-slate-300"
        />
        <div className="min-w-0 flex-1 text-xs">
          <p className="truncate font-mono font-semibold text-indigo-800">{code}</p>
          <p className="truncate text-slate-600">
            {label.client_code} · {label.fabric_brand} / {label.fabric_number}
          </p>
          <p className="truncate text-slate-500">
            {label.garment_type}
            {label.piece_name !== label.garment_type ? ` · ${label.piece_name}` : ""}
          </p>
        </div>
      </div>
      <div className="flex justify-center overflow-hidden p-2">
        <div
          className="border border-slate-200"
          style={{
            width: `${LABEL_ROLL_WIDTH_MM * previewScale}mm`,
            height: `${LABEL_ROLL_HEIGHT_MM * previewScale}mm`,
          }}
        >
          {imgFailed ? (
            <div
              className="pointer-events-none"
              style={{
                width: labelRollWidthCss(),
                height: labelRollHeightCss(),
                transform: `scale(${previewScale})`,
                transformOrigin: "top left",
              }}
            >
              <StickerCell label={label} role={role} />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pngUrl}
              alt={`Sticker ${code} print preview`}
              loading="lazy"
              onError={() => setImgFailed(true)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
                backgroundColor: "#ffffff",
              }}
            />
          )}
        </div>
      </div>
    </label>
  );
}

export function StickerPrintPreviewModal({
  open,
  onClose,
  onPrint,
  items,
  defaultSelectedCodes,
  title = "Print sticker preview",
  printing = false,
  orderId,
  sheet = "pieces",
  po,
  poId,
}: StickerPrintPreviewModalProps) {
  const allCodes = useMemo(() => items.map((item) => item.label.sticker_code), [items]);
  const initialSelection = useMemo(
    () => new Set(defaultSelectedCodes?.length ? defaultSelectedCodes : allCodes),
    [allCodes, defaultSelectedCodes]
  );
  const [selected, setSelected] = useState<Set<string>>(initialSelection);
  const [printConfirmed, setPrintConfirmed] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const { rotation, setRotation } = useLabelRotation();
  const { scalePct, setScalePct } = useLabelScale();

  // New token each time the modal opens or the print geometry changes → preview <img> URLs
  // change → the browser always fetches a fresh render, never a stale cached asset.
  const previewToken = useMemo(
    () => `${rotation}-${scalePct}-${open ? Date.now() : 0}`,
    [open, rotation, scalePct]
  );

  const platformGuide = useMemo(() => stickerPrintGuide(detectStickerPrintPlatform()), []);

  useEffect(() => {
    if (open) {
      setSelected(new Set(defaultSelectedCodes?.length ? defaultSelectedCodes : allCodes));
      setPrintConfirmed(false);
    }
  }, [open, allCodes, defaultSelectedCodes]);

  const selectedCount = selected.size;
  const allSelected = selectedCount === items.length && items.length > 0;

  const toggleCode = useCallback((code: string, next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(code);
      else copy.delete(code);
      return copy;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(allCodes));
  }, [allCodes, allSelected]);

  const handlePrint = useCallback(() => {
    onPrint([...selected]);
  }, [onPrint, selected]);

  const handleDownloadPdf = useCallback(async () => {
    setDownloadingPdf(true);
    setDownloadError(null);
    const ok = await downloadStickerPdf({
      orderId,
      sheet,
      po,
      poId,
      codes: [...selected],
      rotationDeg: rotation,
      scalePct,
    });
    setDownloadingPdf(false);
    if (!ok) setDownloadError("PDF download failed — check you are logged in and try again.");
  }, [orderId, po, poId, rotation, scalePct, selected, sheet]);

  const handleDownloadPng = useCallback(async () => {
    setDownloadingPng(true);
    setDownloadError(null);
    const ok = await downloadStickerPng({
      orderId,
      sheet,
      po,
      poId,
      codes: [...selected],
      rotationDeg: rotation,
      scalePct,
    });
    setDownloadingPng(false);
    if (!ok) setDownloadError("PNG download failed — check you are logged in and try again.");
  }, [orderId, po, poId, rotation, scalePct, selected, sheet]);

  const busy = printing || downloadingPng || downloadingPdf;

  return open ? (
        <div
          className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sticker-print-preview-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="sticker-print-preview-title" className="text-lg font-semibold text-slate-900">
                  {title}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {PRINTING_FREE
                    ? "All stickers are selected by default. Uncheck any you do not want to print."
                    : "Only unprinted stickers are selected by default. Uncheck any you do not want to print."}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={printing}
                className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                <p className="font-semibold">Before you print</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    In the print dialog, open <strong>More settings</strong> and turn{" "}
                    <strong>OFF</strong> &ldquo;Headers and footers&rdquo; — otherwise Chrome adds
                    date, title, and URL on every label.
                  </li>
                  <li>
                    Select printer <strong>D550 / LabelLife</strong> (not your office inkjet).
                  </li>
                  <li>
                    Paper <strong>51×102 mm portrait</strong>, margins <strong>None</strong>, scale{" "}
                    <strong>100%</strong> — do <strong>not</strong> use Fit to page if the preview
                    clips the QR.
                  </li>
                </ul>
                <label className="mt-3 flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={printConfirmed}
                    onChange={(event) => setPrintConfirmed(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-400"
                  />
                  <span>
                    I will turn OFF headers and footers and select the D550 label printer
                  </span>
                </label>
              </div>

              <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                <p className="font-semibold">{platformGuide.headline}</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  {platformGuide.steps.map((step) => (
                    <li key={step.title}>{step.title}</li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-emerald-800">{STICKER_PRINT_PAPER_NOTE}</p>
                <p className="mt-2 text-xs text-emerald-800">{STICKER_PRINT_SCALE_NOTE}</p>
                <p className="mt-2 text-xs text-emerald-800">{STICKER_PRINT_HEADERS_HINT}</p>
                {platformGuide.fallback ? (
                  <p className="mt-2 text-xs text-slate-600">{platformGuide.fallback}</p>
                ) : null}
              </div>

              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <LabelPrinterSettingsControl
                  rotation={rotation}
                  onRotationChange={setRotation}
                  scalePct={scalePct}
                  onScalePctChange={setScalePct}
                  compact
                />
              </div>

              {downloadError ? (
                <p className="mb-3 text-sm text-red-700">{downloadError}</p>
              ) : null}

              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Select all ({items.length})
                </label>
                <p className="text-sm text-slate-500">
                  {selectedCount} of {items.length} selected
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <PreviewCard
                    key={item.label.sticker_code}
                    item={item}
                    checked={selected.has(item.label.sticker_code)}
                    onToggle={toggleCode}
                    orderId={orderId}
                    sheet={sheet}
                    po={po}
                    poId={poId}
                    rotation={rotation}
                    scalePct={scalePct}
                    token={previewToken}
                  />
                ))}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleDownloadPdf()}
                disabled={busy || selectedCount === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                {downloadingPdf ? "Downloading…" : "PDF"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleDownloadPng()}
                disabled={busy || selectedCount === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                {downloadingPng ? "Downloading…" : "PNG"}
              </Button>
              <Button onClick={handlePrint} disabled={busy || selectedCount === 0 || !printConfirmed}>
                <Printer className="mr-2 h-4 w-4" />
                {printing ? "Preparing…" : `Print (${selectedCount})`}
              </Button>
            </div>
          </div>
        </div>
  ) : null;
}
