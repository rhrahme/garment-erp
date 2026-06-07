"use client";

import { useState } from "react";
import { qrImageUrl } from "@/lib/production/qr-labels";
import { cn } from "@/lib/utils";

type FabricCutQrImageProps = {
  fabricCutCode: string;
  size?: number;
  className?: string;
};

/** Fabric-cut QR — shows a fallback if the image fails (e.g. network). */
export function FabricCutQrImage({ fabricCutCode, size = 96, className }: FabricCutQrImageProps) {
  const [failed, setFailed] = useState(false);
  const displaySize = Math.round(size / 2);

  if (!fabricCutCode.trim()) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  if (failed) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 font-mono text-[9px] leading-tight text-slate-500",
          className
        )}
        style={{ width: displaySize, height: displaySize }}
        title={fabricCutCode}
      >
        QR
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={qrImageUrl(fabricCutCode, size)}
      alt={`QR ${fabricCutCode}`}
      width={displaySize}
      height={displaySize}
      loading="eager"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("shrink-0", className)}
    />
  );
}
