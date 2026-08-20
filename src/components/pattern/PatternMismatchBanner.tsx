import { AlertTriangle } from "lucide-react";
import type { PatternSalesOrderMismatch } from "@/lib/sales-orders/pattern-so-mismatch";

type PatternMismatchBannerProps = {
  mismatch: PatternSalesOrderMismatch;
  className?: string;
};

export function PatternMismatchBanner({ mismatch, className = "" }: PatternMismatchBannerProps) {
  if (!mismatch.has_mismatch) return null;

  const severity = mismatch.stale_line_ids.length > 0 ? "red" : "amber";
  const borderClass =
    severity === "red" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50";
  const iconClass = severity === "red" ? "text-red-700" : "text-amber-700";
  const textClass = severity === "red" ? "text-red-900" : "text-amber-900";
  const detailClass = severity === "red" ? "text-red-800" : "text-amber-800";

  return (
    <div
      className={`mb-6 flex gap-3 rounded-xl border p-4 ${borderClass} ${className}`}
      role="alert"
    >
      <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${iconClass}`} aria-hidden />
      <div className={`text-sm ${textClass}`}>
        <p className="font-semibold">
          SO has {mismatch.fabric_line_count} fabric line
          {mismatch.fabric_line_count !== 1 ? "s" : ""} but {mismatch.active_pattern_job_count}{" "}
          active pattern job{mismatch.active_pattern_job_count !== 1 ? "s" : ""}.
        </p>
        <p className={`mt-1 ${detailClass}`}>
          The ERP sales order is the source of truth. Leftover pattern jobs for fabrics that
          are no longer on this order are cancelled automatically.
        </p>
        {mismatch.stale_line_ids.length > 0 ? (
          <p className={`mt-1 ${detailClass}`}>
            {mismatch.stale_line_ids.length} leftover job
            {mismatch.stale_line_ids.length !== 1 ? "s" : ""} still point at removed fabrics.
            Refresh this page, then tick only fabrics still on the sales order.
          </p>
        ) : null}
      </div>
    </div>
  );
}
