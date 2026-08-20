"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  CARTON_STICKER_PRINT_CSS,
  type CartonStickerData,
} from "@/lib/inventory/carton-sticker";
import { qrImageUrl } from "@/lib/production/qr-labels";

export type { CartonStickerData };

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <p className="row">
      <span className="lab">{label}: </span>
      {value}
    </p>
  );
}

export function CartonStickersPrintView({ stickers }: { stickers: CartonStickerData[] }) {
  return (
    <div className="carton-sticker-sheet">
      <style dangerouslySetInnerHTML={{ __html: CARTON_STICKER_PRINT_CSS }} />
      <div className="screen-only mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {stickers.length} box sticker{stickers.length === 1 ? "" : "s"} - 4x6 inch, one per
          box. Print 4x6, scale 100% / Actual size, do not fit to paper.
        </p>
        <Button onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" />
          Print
        </Button>
      </div>
      {stickers.map((sticker) => (
        <div key={sticker.carton_id} className="carton-sticker">
          <p className="kicker">Inventory box</p>
          <p className="item">{sticker.item_name}</p>
          {sticker.photo_url ? (
            <div className="media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="photo" src={sticker.photo_url} alt="" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="qr" src={qrImageUrl(sticker.open_url, 400)} alt="Open-box QR" />
            </div>
          ) : (
            <div className="qr-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="qr" src={qrImageUrl(sticker.open_url, 400)} alt="Open-box QR" />
            </div>
          )}
          <p className="qty">
            {sticker.quantity} {sticker.unit} in this box
          </p>
          <DetailRow label="Brand" value={sticker.brand} />
          <DetailRow label="Category" value={sticker.category} />
          <DetailRow label="Location" value={sticker.location} />
          <DetailRow label="Notes" value={sticker.notes} />
          <p className="row">
            <span className="lab">Status: </span>
            {sticker.status === "opened" ? "Opened" : "Sealed - not yet in stock"}
          </p>
          <DetailRow label="Registered" value={sticker.registered_on} />
          <p className="code">
            <span className="lab">Box: </span>
            {sticker.carton_id}
          </p>
          <p className="hint">
            OPENING THIS BOX? Scan the QR with your phone and tap Start using - the quantity
            is added to inventory automatically. Scan once per box.
          </p>
        </div>
      ))}
    </div>
  );
}
