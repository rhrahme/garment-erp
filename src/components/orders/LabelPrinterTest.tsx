"use client";

import { useCallback } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LabelPrinterSettingsControl } from "@/components/orders/LabelRotationControl";
import { StickerCell } from "@/components/orders/StickerCell";
import { useLabelRotation } from "@/hooks/useLabelRotation";
import { useLabelScale } from "@/hooks/useLabelScale";
import { useStickerPrint } from "@/hooks/useStickerPrint";
import { labelRollSizeLabel } from "@/lib/production/label-print-config";
import { labelPdfOrientation, labelPdfPageSizeMm } from "@/lib/production/label-printer-settings";
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

  const pageSize = labelPdfPageSizeMm(rotation);
  const orientation = labelPdfOrientation(rotation);
  const mediaLabel = `${pageSize.width} × ${pageSize.height} mm ${orientation}`;
  const altLabel =
    orientation === "landscape"
      ? "50 × 100 mm portrait"
      : "100 × 50 mm landscape (default)";

  const handlePrint = useCallback(() => {
    requestPrint({ orderId: "test", sheet: "test", rotationDeg: rotation, scalePct });
  }, [requestPrint, rotation, scalePct]);

  return (
    <div>
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
          AIMO / Phomemo “D550” roll printing (landscape 100×50)
        </p>
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          <p className="font-semibold">
            This printer’s physical label is LANDSCAPE — 100 mm wide × 50 mm tall. Use the default
            landscape layout (QR left, text right) and these exact print-dialog settings.
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>
              Media / paper size: <strong>100 × 50 mm landscape</strong> (add a{" "}
              <strong>Custom size 100×50</strong> in the driver if there is no preset).
            </li>
            <li>
              Scale: <strong>100%</strong> — <strong>NEVER “Fit to paper” / “Shrink oversized”</strong>.
              “Fit to paper” combined with a 51×102 portrait media is exactly what was rotating the label
              90°: the driver was squeezing a 100×50 design onto a tall 51×102 sheet, so it turned it
              sideways.
            </li>
            <li>
              Margins: <strong>None</strong>. Headers &amp; footers: <strong>OFF</strong>.
            </li>
          </ul>
          <p className="mt-1">
            At the current setting the PDF page is <strong>{mediaLabel}</strong>. The driver media must match
            this exactly. Only switch to <strong>{altLabel}</strong> if your physical label is actually taller
            than it is wide.
          </p>
        </div>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Physical roll label is <strong>{labelRollSizeLabel()}</strong> held LANDSCAPE — 100 mm wide × 50 mm
            tall (the 100 mm long edge runs across the head). The roll advances{" "}
            <strong>one label at a time</strong>; each PDF page is <strong>exactly one label</strong>. Never use
            multi-label or “N-up” templates.
          </li>
          <li>
            Keep rotation on <strong>Landscape 100×50 (default)</strong> — QR on the left, horizontal text on
            the right, read left-to-right without turning the label.
          </li>
          <li>
            In the print dialog: <strong>Paper / media size {mediaLabel}</strong>,{" "}
            <strong>Scale 100%</strong> (NOT “Fit to paper”), <strong>Margins: None</strong>. Matching the
            media to the PDF page is what stops the driver from auto-rotating.
          </li>
          <li>
            Click <strong>Print test labels</strong> — you should get <strong>2 labels</strong> (S10008, then
            S10009), each centred and identical (no drift). If content looks too small, try Medium (125%) or
            Large (150%).
          </li>
          <li>
            If content prints upside down, switch to <strong>Landscape — flipped</strong>. Use the{" "}
            <strong>Portrait 50×100</strong> options only if your physical label is taller than it is wide.
          </li>
          <li>Select your thermal printer (not “Save as PDF” unless checking layout only).</li>
          <li>Scan the QR with Fabric Receiving — it should read <code className="font-mono">L01-SHT</code>.</li>
        </ol>
      </div>

      <div className="no-print mb-4">
        <Button onClick={handlePrint} disabled={printing}>
          <Printer className="mr-2 h-4 w-4" />
          {printing ? "Preparing PDF…" : "Print test labels (2 pages)"}
        </Button>
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
