"use client";

import { ArrowRightLeft } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { GarmentTypeChangeFlag } from "@/lib/sales-orders/garment-type-change-flags";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type GarmentTypeChangeBadgeProps = {
  flag: GarmentTypeChangeFlag;
  className?: string;
  showUnacknowledged?: boolean;
};

export function GarmentTypeChangeBadge({
  flag,
  className,
  showUnacknowledged = true,
}: GarmentTypeChangeBadgeProps) {
  const needsAttention = showUnacknowledged && !flag.acknowledged;
  const title = [
    `Garment type changed ${flag.from_garment_type} → ${flag.to_garment_type}`,
    `By ${flag.changed_by} · ${formatDateTime(flag.changed_at)}`,
    needsAttention ? "Needs admin review" : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span title={title} className={className}>
      <Badge
        className={cn(
          "gap-1",
          needsAttention
            ? "border border-amber-300 bg-amber-100 text-amber-900"
            : "border border-slate-200 bg-slate-100 text-slate-700"
        )}
      >
        <ArrowRightLeft className="h-3 w-3 shrink-0" aria-hidden />
        {flag.from_garment_type} → {flag.to_garment_type}
      </Badge>
    </span>
  );
}
