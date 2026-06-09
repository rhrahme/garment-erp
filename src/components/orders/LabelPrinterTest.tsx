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

  const pageSize = labelPdfPageSizeMm(rotation);
  const orientation = labelPdfOrientation(rotation);
  const mediaLabel = `${pageSize.width} × ${pageSize.height} mm ${orientation}`;
  const isPrinterMatch = rotation === PRINTER_MATCH_MODE;

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
            The PDF is built at <strong>{mediaLabel}</strong> — exactly your driver media — with the label
            pre-rotated so it cancels the printer’s built-in 90° turn. It prints reading horizontally on the
            landscape label: <strong>QR on the left, text on the right</strong>.
          </p>
        </div>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Keep the mode on <strong>“Match my printer (51×102, Fit to paper)”</strong> (the default). The
            screen preview will look sideways — that’s expected; it’s pre-rotated so the physical print comes
            out straight.
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
