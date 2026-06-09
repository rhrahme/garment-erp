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
    orientation === "portrait"
      ? "100 × 50 mm landscape (rotation 90°)"
      : "50 × 100 mm portrait (rotation 0°)";

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
        <p className="font-semibold text-slate-900">LabelLife / AIMO roll printing (portrait 50×100)</p>
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          <p className="font-semibold">
            Default = portrait upright: QR on top, text below. Use these exact print-dialog settings.
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>
              Media / paper: <strong>50 × 100 mm portrait</strong> (the driver preset{" "}
              <strong>“51 × 102 mm portrait”</strong> is correct — don’t fight it).
            </li>
            <li>
              Scale: <strong>100%</strong> — turn <strong>OFF “Fit to paper” / “Shrink oversized”</strong>.
              This is the #1 cause of sideways/vertical text.
            </li>
            <li>
              Margins: <strong>None</strong>. Headers &amp; footers: <strong>OFF</strong>.
            </li>
          </ul>
          <p className="mt-1">
            At the current rotation the PDF page is <strong>{mediaLabel}</strong>. Only switch rotation (to{" "}
            <strong>{altLabel}</strong>) if your printer genuinely feeds the long edge first.
          </p>
        </div>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Physical roll label is <strong>{labelRollSizeLabel()}</strong> (50×100 mm portrait — the 50 mm
            edge crosses the print head). The roll advances <strong>one label at a time</strong>; each PDF page
            is <strong>exactly one label</strong>. Never use multi-label or “N-up” templates.
          </li>
          <li>
            Keep rotation on <strong>0° (portrait upright, 50×100)</strong> — QR on top, horizontal text below,
            read top-to-bottom without turning the label. This is the default for the AIMO / Phomemo 50 mm
            head.
          </li>
          <li>
            In the print dialog: <strong>Scale 100%</strong> (NOT “Fit to paper”), <strong>Margins: None</strong>
            , paper <strong>{mediaLabel}</strong>.
          </li>
          <li>
            Click <strong>Print test labels</strong> — you should get <strong>2 labels</strong> (S10008, then
            S10009), each centred and identical (no drift). If content looks too small, try Medium (125%) or
            Large (150%).
          </li>
          <li>
            If content prints upside down, use <strong>180°</strong> (portrait flipped). Use{" "}
            <strong>90° / 270°</strong> (landscape 100×50) only for the long-edge-feed edge case.
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
