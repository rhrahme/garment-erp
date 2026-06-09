"use client";

import { useCallback } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LabelPrinterSettingsControl } from "@/components/orders/LabelRotationControl";
import { StickerCell } from "@/components/orders/StickerCell";
import { useLabelRotation } from "@/hooks/useLabelRotation";
import { useLabelScale } from "@/hooks/useLabelScale";
import { useStickerPrint } from "@/hooks/useStickerPrint";
import { labelPdfMediaLabel, labelPdfMediaMmLabel, labelRollSizeLabel } from "@/lib/production/label-print-config";
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
        <p className="font-semibold text-slate-900">LabelLife / AIMO roll printing</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Set media / paper size to <strong>{labelPdfMediaMmLabel()}</strong> (
            {labelPdfMediaLabel()}) in LabelLife or the AIMO driver.
          </li>
          <li>
            Each PDF page is <strong>exactly one label</strong> — the roll advances one page per physical
            label. Do not use multi-label templates or “N-up” layout.
          </li>
          <li>
            In the print dialog: <strong>Scale 100%</strong> (not “Fit to page” or “Shrink oversized”),{" "}
            <strong>Margins: None</strong>, paper <strong>{labelPdfMediaMmLabel()}</strong>.
          </li>
          <li>
            Leave rotation at <strong>0° — landscape (default)</strong> above unless QR or text prints
            sideways or upside down — then try 90°, 180°, or 270°.
          </li>
          <li>
            Click <strong>Print test label</strong> — you should get <strong>2 labels</strong> (S10008, then
            S10009). If content looks too small, try Medium (125%) or Large (150%).
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
