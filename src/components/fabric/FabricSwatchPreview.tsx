"use client";

import type { ReactNode } from "react";
import { DrapersFabricSwatch } from "@/components/fabric-specification/DrapersFabricSwatch";
import { useFabricSwatch } from "@/components/fabric/FabricSwatchProvider";
import type { FabricSwatchUrls } from "@/lib/fabric-sourcing/fabric-swatch-keys";
import { cn } from "@/lib/utils";

type FabricSwatchPreviewProps = {
  supplierId: string;
  fabricNumber: string;
  /** Amber ring — use on sold-out / unavailable lines. */
  highlight?: boolean;
  className?: string;
  swatch?: FabricSwatchUrls;
};

export function FabricSwatchPreview({
  supplierId,
  fabricNumber,
  highlight = false,
  className,
  swatch,
}: FabricSwatchPreviewProps) {
  const getSwatch = useFabricSwatch();
  const urls = swatch ?? getSwatch?.(supplierId, fabricNumber);

  return (
    <DrapersFabricSwatch
      fabricNumber={fabricNumber}
      src={urls?.square}
      zoomSrc={urls?.zoom}
      className={cn(highlight && "ring-2 ring-amber-400 ring-offset-1", className)}
    />
  );
}

type FabricNumberWithSwatchProps = {
  supplierId: string;
  fabricNumber: string;
  highlight?: boolean;
  className?: string;
  numberClassName?: string;
  children?: ReactNode;
};

/** Compact inline row: thumbnail + fabric number + optional badges. */
export function FabricNumberWithSwatch({
  supplierId,
  fabricNumber,
  highlight = false,
  className,
  numberClassName,
  children,
}: FabricNumberWithSwatchProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <FabricSwatchPreview
        supplierId={supplierId}
        fabricNumber={fabricNumber}
        highlight={highlight}
      />
      <span className={cn("font-mono font-medium", numberClassName)}>{fabricNumber}</span>
      {children}
    </span>
  );
}
