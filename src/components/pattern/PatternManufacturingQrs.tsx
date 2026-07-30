"use client";

import { qrImageUrl } from "@/lib/production/qr-labels";
import type { ManufacturingStickerQr } from "@/lib/pattern/manufacturing-stickers";

type PatternManufacturingQrsProps = {
  stickers: ManufacturingStickerQr[];
  /** Display size in CSS px (image is requested at 2x for crisp print/scan). */
  size?: number;
};

/**
 * Manufacturing / floor sticker QRs for a pattern job line.
 * Payloads match production sticker print (piece codes) and prep fabric-cut.
 */
export function PatternManufacturingQrs({
  stickers,
  size = 128,
}: PatternManufacturingQrsProps) {
  if (stickers.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No manufacturing sticker QRs on this fabric line yet.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-4">
      {stickers.map((sticker) => (
        <div
          key={`${sticker.role}-${sticker.qr_payload}`}
          className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrImageUrl(sticker.qr_payload, size * 2)}
            alt={`QR ${sticker.production_code}`}
            style={{ width: size, height: size }}
            className="bg-white"
          />
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {sticker.role === "prep" ? "Fabric cut (prep)" : sticker.piece_name}
          </p>
          <p className="max-w-[10rem] break-all text-center font-mono text-[11px] leading-tight text-slate-800">
            {sticker.production_code}
          </p>
        </div>
      ))}
    </div>
  );
}
