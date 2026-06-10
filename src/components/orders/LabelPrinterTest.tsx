"use client";

import { useCallback, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LabelPrinterSettingsControl } from "@/components/orders/LabelRotationControl";
import { StickerCell } from "@/components/orders/StickerCell";
import { useLabelRotation } from "@/hooks/useLabelRotation";
import { useLabelScale } from "@/hooks/useLabelScale";
import { useStickerPrint } from "@/hooks/useStickerPrint";
import { labelRollSizeLabel } from "@/lib/production/label-print-config";
import { downloadStickerPdf, downloadStickerPng } from "@/lib/production/print-stickers";
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
  const [downloading, setDownloading] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);

  const pageSize = labelPdfPageSizeMm(rotation);
  const orientation = labelPdfOrientation(rotation);
  const mediaLabel = `${pageSize.width} × ${pageSize.height} mm ${orientation}`;
  const isPrinterMatch = rotation === PRINTER_MATCH_MODE;

  const handlePrint = useCallback(() => {
    requestPrint({ orderId: "test", sheet: "test", rotationDeg: rotation, scalePct });
  }, [requestPrint, rotation, scalePct]);

  const handleCalibration = useCallback(() => {
    requestPrint({ orderId: "test", sheet: "calibration" });
  }, [requestPrint]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    await downloadStickerPdf({ orderId: "test", sheet: "test", rotationDeg: rotation, scalePct });
    setDownloading(false);
  }, [rotation, scalePct]);

  const handleDownloadPng = useCallback(async () => {
    setDownloadingPng(true);
    await downloadStickerPng({ orderId: "test", sheet: "test", rotationDeg: rotation, scalePct });
    setDownloadingPng(false);
  }, [rotation, scalePct]);

  return (
    <div>
      <div className="no-print mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900">
        <p className="text-base font-semibold">If labels still print blank</p>
        <p className="mt-1">
          Stickers are now <strong>full-page bitmaps</strong> inside the PDF (D550 ignores vector text).
          If the PDF is still blank on the printer, use <strong>Download PNG</strong> → open in{" "}
          <strong>Preview.app</strong> → File → Print at <strong>100% scale</strong> on{" "}
          <strong>51×102 mm</strong> media (or import the PNG into LabelLife).
        </p>
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
            The PDF is built at <strong>{mediaLabel}</strong> — exactly your driver media — with QR on
            top and text below (no PDF rotation matrices). The printer’s built-in ~90° CCW turn maps
            that onto the landscape label: <strong>QR on the left, text on the right</strong>.
          </p>
        </div>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Keep the mode on <strong>“Match my printer (51×102, Fit to paper)”</strong> (the default).
            The on-screen preview matches the PDF layout (QR on top, text below).
          </li>
          <li>
            Physical roll label is <strong>{labelRollSizeLabel()}</strong> held LANDSCAPE — ~100 mm wide × 50 mm
            tall. The roll advances <strong>one label at a time</strong>; each PDF page is{" "}
            <strong>exactly one label</strong>.
          </li>
          <li>
            In the print dialog just confirm <strong>your existing D550 settings</strong> (media{" "}
            {mediaLabel}, Fit to paper, Margins None) and print. No driver changes needed.
          </li>
          <li>
            Click <strong>Print test labels</strong> — you should get <strong>2 labels</strong> (S10008, then
            S10009), each reading horizontally. If content looks too small, try Medium (125%) or Large (150%).
          </li>
          <li>
            Only if “Match my printer” somehow comes out wrong on a different printer, try the geometric
            alternates (<strong>Landscape 100×50</strong> or <strong>Portrait 50×100</strong>), which require
            matching the driver media and Scale 100%.
          </li>
          <li>Select your thermal printer (not “Save as PDF” unless checking layout only).</li>
          <li>Scan the QR with Fabric Receiving — it should read <code className="font-mono">L01-SHT</code>.</li>
        </ol>
        {!isPrinterMatch ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
            You’re on a geometric alternate, not “Match my printer”. This mode needs the driver media set to{" "}
            <strong>{mediaLabel}</strong> with <strong>Scale 100% (not “Fit to paper”)</strong>.
          </p>
        ) : null}
      </div>

      <div className="no-print mb-4 flex flex-wrap gap-3">
        <Button onClick={handlePrint} disabled={printing || downloading || downloadingPng}>
          <Printer className="mr-2 h-4 w-4" />
          {printing ? "Preparing PDF…" : "Print test labels (2 pages)"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void handleDownload()}
          disabled={printing || downloading || downloadingPng}
        >
          <Download className="mr-2 h-4 w-4" />
          {downloading ? "Downloading…" : "Download PDF"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void handleDownloadPng()}
          disabled={printing || downloading || downloadingPng}
        >
          <Download className="mr-2 h-4 w-4" />
          {downloadingPng ? "Downloading…" : "Download PNG"}
        </Button>
        <Button variant="secondary" onClick={handleCalibration} disabled={printing || downloading || downloadingPng}>
          <Printer className="mr-2 h-4 w-4" />
          {printing ? "Preparing PDF…" : "Print rotation calibration (A/B/C/D)"}
        </Button>
      </div>

      <div className="no-print mb-6 rounded-xl border border-amber-300 bg-amber-50/70 px-4 py-4 text-sm text-amber-900">
        <p className="font-semibold">One-time rotation calibration (A / B / C / D)</p>
        <p className="mt-1">
          If labels keep coming out rotated 90°, click{" "}
          <strong>“Print rotation calibration (A/B/C/D)”</strong> above. It prints ONE job of 4 pages
          (51×102 mm) — keep your <strong>current D550 settings</strong> (51×102, Fit to paper). Each page
          shows a huge letter and the same QR + text drawn at a different rotation:
        </p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li><strong>A</strong> = content rotated 0°</li>
          <li><strong>B</strong> = content rotated 90° CW</li>
          <li><strong>C</strong> = content rotated 180°</li>
          <li><strong>D</strong> = content rotated 270° CW</li>
        </ul>
        <p className="mt-1">
          Exactly one page will come out <strong>upright and readable</strong> (QR top-left, text
          horizontal). Tell us that letter and we’ll lock it in as the default.
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
