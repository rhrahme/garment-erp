"use client";

import { useCallback, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StickerCell } from "@/components/orders/StickerCell";
import { useStickerPrint } from "@/hooks/useStickerPrint";
import { labelRollSizeLabel, labelRollSizeMmLabel } from "@/lib/production/label-print-config";
import { stickerPrintStyles } from "@/lib/production/sticker-print-styles";
import type { PrintableStickerLabel } from "@/lib/production/qr-labels";

const TEST_LABEL: PrintableStickerLabel = {
  sticker_code: "TEST-L01-SHT",
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

  const handlePrint = useCallback(() => {
    requestPrint({ orderId: "test", sheet: "test" });
  }, [requestPrint]);

  return (
    <div>
      <div className="no-print mb-6 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Before printing</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            In <strong>LabelLife</strong> or the <strong>AIMO driver</strong>, set media to{" "}
            <strong>{labelRollSizeLabel()}</strong> ({labelRollSizeMmLabel()}).
          </li>
          <li>
            Click <strong>Print test label</strong> — a server PDF opens (no browser date/URL headers). Set{" "}
            <strong>Scale 100%</strong>, <strong>Margins: None</strong>, paper <strong>{labelRollSizeMmLabel()}</strong>.
          </li>
          <li>Select your thermal printer (not “Save as PDF” unless testing layout only).</li>
          <li>Scan the QR with Fabric Receiving — it should read <code className="font-mono">L01-SHT</code>.</li>
        </ol>
      </div>

      <div className="no-print mb-4">
        <Button onClick={handlePrint} disabled={printing}>
          <Printer className="mr-2 h-4 w-4" />
          {printing ? "Preparing PDF…" : "Print test label"}
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
