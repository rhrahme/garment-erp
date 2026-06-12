"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LabelPrinterSettingsControl } from "@/components/orders/LabelRotationControl";
import { StickerCell } from "@/components/orders/StickerCell";
import { useLabelRotation } from "@/hooks/useLabelRotation";
import { useLabelScale } from "@/hooks/useLabelScale";
import { useStickerPrint } from "@/hooks/useStickerPrint";
import { labelRollSizeLabel } from "@/lib/production/label-print-config";
import {
  detectStickerPrintPlatform,
  stickerPrintGuide,
} from "@/lib/production/sticker-print-platform";
import { STICKER_PRINT_PAPER_NOTE, STICKER_PRINT_SCALE_NOTE } from "@/lib/production/sticker-print-html";
import {
  downloadStickerPdf,
  downloadStickerPng,
  STICKER_PRINT_HEADERS_HINT,
} from "@/lib/production/print-stickers";
import {
  labelPdfOrientation,
  labelPdfPageSizeMm,
  PRINTER_MATCH_MODE,
} from "@/lib/production/label-printer-settings";
import { stickerPrintStyles } from "@/lib/production/sticker-print-styles";
import type { PrintableStickerLabel } from "@/lib/production/qr-labels";

const TEST_LABEL: PrintableStickerLabel = {
  sticker_code: "TEST-L01-SHT",
  fabric_line_id: "test-line",
  production_code: "L01-SHT",
  fabric_cut_code: "L01-SHT",
  qr_payload: "L01-SHT",
  client_code: "FR-0126-0019",
  client_name: "Ralph Rahme",
  garment_type: "Shirt",
  piece_name: "Shirt",
  fabric_number: "S10009",
  supplier_name: "Solbiati",
  fabric_brand: "Solbiati",
  composition: "100% COTTON TEST",
  weight_gsm: 240,
  cut_quantity: 0.9,
  cut_unit: "meters",
  labels_sent: 1,
  article_number: 1,
  sticker_index: 1,
  sticker_total: 14,
};

export function LabelPrinterTest() {
  const { printing, requestPrint } = useStickerPrint();
  const { rotation, setRotation } = useLabelRotation();
  const { scalePct, setScalePct } = useLabelScale();
  const [downloadingPng, setDownloadingPng] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const pageSize = labelPdfPageSizeMm(rotation);
  const orientation = labelPdfOrientation(rotation);
  const mediaLabel = `${pageSize.width} × ${pageSize.height} mm ${orientation}`;
  const isPrinterMatch = rotation === PRINTER_MATCH_MODE;
  const platformGuide = useMemo(() => stickerPrintGuide(detectStickerPrintPlatform()), []);

  const handlePrint = useCallback(() => {
    requestPrint({ orderId: "test", sheet: "test", rotationDeg: rotation, scalePct });
  }, [requestPrint, rotation, scalePct]);

  const handleCalibration = useCallback(() => {
    requestPrint({ orderId: "test", sheet: "calibration" });
  }, [requestPrint]);

  const handleDownloadPng = useCallback(async () => {
    setDownloadingPng(true);
    await downloadStickerPng({ orderId: "test", sheet: "test", rotationDeg: rotation, scalePct });
    setDownloadingPng(false);
  }, [rotation, scalePct]);

  const handleDownloadPdf = useCallback(async () => {
    setDownloadingPdf(true);
    await downloadStickerPdf({ orderId: "test", sheet: "test", rotationDeg: rotation, scalePct });
    setDownloadingPdf(false);
  }, [rotation, scalePct]);

  const busy = printing || downloadingPng || downloadingPdf;

  return (
    <div>
      <div className="no-print mb-6 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
        <p className="text-base font-semibold">{platformGuide.headline}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {platformGuide.steps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong> — {step.detail}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-emerald-800">{STICKER_PRINT_PAPER_NOTE}</p>
        <p className="mt-2 text-xs text-emerald-800">{STICKER_PRINT_SCALE_NOTE}</p>
        <p className="mt-2 text-xs text-emerald-800">{STICKER_PRINT_HEADERS_HINT}</p>
        {platformGuide.fallback ? (
          <p className="mt-2 text-xs text-emerald-800">{platformGuide.fallback}</p>
        ) : null}
      </div>

      <div className="no-print mb-6 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
        <LabelPrinterSettingsControl
          rotation={rotation}
          onRotationChange={setRotation}
          scalePct={scalePct}
          onScalePctChange={setScalePct}
        />
      </div>

      <div className="no-print mb-6 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">
          AIMO / Phomemo “D550” roll printing — “Match my printer” mode
        </p>
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900">
          <p className="font-semibold">
            Keep your current driver settings (51×102 mm, “Fit to paper”). Just print — don’t change anything.
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>
              Driver media / paper size: <strong>leave it on 51 × 102 mm portrait</strong> (your D550 preset).
            </li>
            <li>
              Scale: <strong>leave it on “Fit to paper”</strong>. You do NOT need to change it to 100%.
            </li>
            <li>
              Margins: <strong>None</strong>. Headers &amp; footers: <strong>OFF</strong>.
            </li>
          </ul>
          <p className="mt-1">
            Labels are rasterized at <strong>{mediaLabel}</strong> — exactly your driver media — with QR on
            top and text below (no PDF rotation matrices). The printer’s built-in ~90° CCW turn maps
            that onto the landscape label: <strong>QR on the left, text on the right</strong>.
          </p>
        </div>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Click <strong>Print test labels</strong> — the system print dialog opens with 2 pages (no download).
          </li>
          <li>
            Confirm D550 at {mediaLabel}, Fit to paper, headers/footers OFF.
          </li>
          <li>
            You should get <strong>2 labels</strong> (S10008, then S10009). Scan the QR — it should read{" "}
            <code className="font-mono">L01-SHT</code>.
          </li>
        </ol>
        {!isPrinterMatch ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
            You’re on a geometric alternate, not “Match my printer”. This mode needs the driver media set to{" "}
            <strong>{mediaLabel}</strong> with <strong>Scale 100% (not “Fit to paper”)</strong>.
          </p>
        ) : null}
      </div>

      <div className="no-print mb-4 flex flex-wrap gap-3">
        <Button onClick={handlePrint} disabled={busy}>
          <Printer className="mr-2 h-4 w-4" />
          {printing ? "Preparing…" : "Print test labels (2 pages)"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void handleDownloadPdf()} disabled={busy}>
          <Download className="mr-2 h-4 w-4" />
          {downloadingPdf ? "Downloading…" : "PDF"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void handleDownloadPng()} disabled={busy}>
          <Download className="mr-2 h-4 w-4" />
          {downloadingPng ? "Downloading…" : "PNG"}
        </Button>
        <Button variant="secondary" onClick={handleCalibration} disabled={busy}>
          <Printer className="mr-2 h-4 w-4" />
          {printing ? "Preparing…" : "Print calibration (A/B/C/D)"}
        </Button>
      </div>

      <div className="no-print mb-6 rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-4 text-sm text-amber-900">
        <p className="font-semibold">One-time rotation calibration (A / B / C / D)</p>
        <p className="mt-1">
          If labels keep coming out rotated 90°, click{" "}
          <strong>“Print calibration (A/B/C/D)”</strong> above. Print with your{" "}
          <strong>current D550 settings</strong> (51×102, Fit to paper).
        </p>
      </div>

      <div className="sticker-print-zone">
        <div className="sticker-roll inline-block">
          <div className="sticker-page">
            <StickerCell label={TEST_LABEL} role="prep" />
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: stickerPrintStyles() }} />
    </div>
  );
}
