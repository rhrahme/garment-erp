"use client";

import { qrImageUrl } from "@/lib/production/qr-labels";

/**
 * Fixed pattern QR shown on detail pages — encodes the permanent deep link so
 * the physical archived pattern can be labeled once and scanned forever.
 */
export function PatternQrBadge({
  payload,
  label,
  size = 96,
}: {
  /** Deep-link URL encoded in the QR (immutable — built from the pattern id). */
  payload: string;
  /** Human-readable code printed under the QR. */
  label: string;
  size?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qrImageUrl(payload, size * 2)}
        alt={`QR code — ${label}`}
        style={{ width: size, height: size }}
      />
      <p className="max-w-32 break-all text-center font-mono text-[9px] leading-tight text-slate-600">
        {label}
      </p>
      <p className="text-[8px] uppercase tracking-wide text-slate-400">Scan to open</p>
    </div>
  );
}
