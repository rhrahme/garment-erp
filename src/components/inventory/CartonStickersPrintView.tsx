"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { qrImageUrl } from "@/lib/production/qr-labels";

export type CartonStickerData = {
  carton_id: string;
  status: "sealed" | "opened";
  quantity: number;
  unit: string;
  item_name: string;
  brand: string | null;
  open_url: string;
};

/* Print recipe per KNOWLEDGE.md: @page A4 portrait 12mm, pt fonts,
   Helvetica/Arial, no transform/zoom, no max-w wrappers. 8 stickers per A4. */
const PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
.carton-sticker-sheet {
  font-family: Helvetica, Arial, sans-serif;
  color: #000;
  width: 100%;
}
.carton-sticker-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4mm;
}
.carton-sticker {
  border: 1.5pt solid #000;
  border-radius: 6pt;
  padding: 4mm;
  height: 60mm;
  display: flex;
  gap: 4mm;
  align-items: center;
  page-break-inside: avoid;
  overflow: hidden;
}
.carton-sticker .qr { width: 38mm; height: 38mm; flex: none; }
.carton-sticker .txt { min-width: 0; }
.carton-sticker .item { font-size: 13pt; font-weight: 700; line-height: 1.15; }
.carton-sticker .qty { font-size: 12pt; font-weight: 700; margin-top: 2mm; }
.carton-sticker .hint { font-size: 8.5pt; line-height: 1.25; margin-top: 2mm; }
.carton-sticker .code { font-size: 7pt; color: #444; margin-top: 2mm; word-break: break-all; }
@media print {
  .screen-only { display: none !important; }
}
`;

export function CartonStickersPrintView({ stickers }: { stickers: CartonStickerData[] }) {
  return (
    <div className="carton-sticker-sheet p-6">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="screen-only mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {stickers.length} carton sticker{stickers.length === 1 ? "" : "s"} - glue one on each
          box. Print A4 portrait, scale 100%.
        </p>
        <Button onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" />
          Print
        </Button>
      </div>
      <div className="carton-sticker-grid">
        {stickers.map((sticker) => (
          <div key={sticker.carton_id} className="carton-sticker">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="qr" src={qrImageUrl(sticker.open_url, 300)} alt="Open-box QR" />
            <div className="txt">
              <p className="item">
                {sticker.item_name}
                {sticker.brand ? ` (${sticker.brand})` : ""}
              </p>
              <p className="qty">
                {sticker.quantity} {sticker.unit} in this box
              </p>
              <p className="hint">
                OPENING THIS BOX? Scan the QR with your phone and tap Start using - the quantity
                is added to inventory automatically. Scan once per box.
              </p>
              <p className="code">{sticker.carton_id}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
