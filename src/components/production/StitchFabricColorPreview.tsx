"use client";

import { FabricSwatchPreview } from "@/components/fabric/FabricSwatchPreview";
import { cn } from "@/lib/utils";

type StitchFabricColorPreviewProps = {
  supplierId?: string | null;
  fabricNumber?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  showNumber?: boolean;
};

/** Mill swatch on the stitch kiosk. Tap to enlarge when a photo exists. */
export function StitchFabricColorPreview({
  supplierId,
  fabricNumber,
  size = "md",
  className,
  showNumber = true,
}: StitchFabricColorPreviewProps) {
  const number = fabricNumber?.trim() ?? "";
  const supplier = supplierId?.trim() ?? "";
  if (!number) return null;

  if (!supplier) {
    return showNumber ? (
      <span className={cn("text-xs text-slate-500", className)}>fabric {number}</span>
    ) : null;
  }

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <FabricSwatchPreview supplierId={supplier} fabricNumber={number} size={size} />
      {showNumber ? <span className="font-mono text-xs text-slate-600">{number}</span> : null}
    </span>
  );
}
