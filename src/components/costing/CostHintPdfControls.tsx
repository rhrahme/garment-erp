"use client";

import { Printer } from "lucide-react";
import { DownloadCostHintPdfButton } from "@/components/costing/DownloadCostHintPdfButton";
import { costHintWorksheetQuery } from "@/lib/costing/cost-hint-worksheet-query";

export function CostHintPdfControls({
  invoiceId,
  soNumber,
  brandId,
  includeArchived,
  downloadLabel = "Cost hint PDF",
  printLabel = "Open print page",
  size = "sm",
  variant = "secondary",
  compact = false,
  showPrintLink = true,
}: {
  invoiceId?: string | null;
  soNumber?: string | null;
  brandId?: string | null;
  includeArchived?: boolean;
  downloadLabel?: string;
  printLabel?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost";
  compact?: boolean;
  showPrintLink?: boolean;
}) {
  const search = costHintWorksheetQuery({ invoiceId, soNumber, brandId, includeArchived });

  return (
    <div className={compact ? "inline-flex items-center gap-1" : "flex flex-wrap items-center gap-2"}>
      <DownloadCostHintPdfButton
        href={`/api/costing/hint-pdf${search}`}
        label={downloadLabel}
        size={size}
        variant={compact ? "ghost" : variant}
        compact={compact}
      />
      {showPrintLink ? (
        <a
          href={`/costing/print${search}`}
          target="_blank"
          rel="noreferrer"
          className={
            compact
              ? "inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              : "inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          }
          title="Open cost hint print page"
        >
          {compact ? <Printer className="h-4 w-4 shrink-0" /> : null}
          <span className={compact ? "hidden lg:inline" : undefined}>{printLabel}</span>
        </a>
      ) : null}
    </div>
  );
}
