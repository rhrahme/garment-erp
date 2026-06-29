import { AlertTriangle } from "lucide-react";
import type { PatternSalesOrderMismatch } from "@/lib/sales-orders/pattern-so-mismatch";

type PatternMismatchBannerProps = {
  mismatch: PatternSalesOrderMismatch;
  className?: string;
};

export function PatternMismatchBanner({ mismatch, className = "" }: PatternMismatchBannerProps) {
  if (!mismatch.has_mismatch) return null;

  const severity =
    mismatch.stale_line_ids.length > 0 ||
    (mismatch.clickup_line_count != null &&
      mismatch.clickup_line_count !== mismatch.fabric_line_count)
      ? "red"
      : "amber";

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
          active pattern job{mismatch.active_pattern_job_count !== 1 ? "s" : ""} — possible data
          mismatch.
        </p>
        <p className={`mt-1 ${detailClass}`}>
          Do not cancel pattern jobs until verified against ClickUp.
          {mismatch.imported_from_clickup
            ? " This order was imported from ClickUp — compare garment lines there before syncing or removing lines."
            : null}
        </p>
        {mismatch.stale_line_ids.length > 0 ? (
          <p className={`mt-1 ${detailClass}`}>
            {mismatch.stale_line_ids.length} pattern job
            {mismatch.stale_line_ids.length !== 1 ? "s" : ""} reference fabric line IDs no longer
            on this order.
          </p>
        ) : null}
        {mismatch.clickup_line_count != null ? (
          <p className={`mt-1 ${detailClass}`}>
            ClickUp shows {mismatch.clickup_line_count} garment line
            {mismatch.clickup_line_count !== 1 ? "s" : ""}
            {mismatch.clickup_task_ids.length > 0
              ? ` (task${mismatch.clickup_task_ids.length !== 1 ? "s" : ""}: ${mismatch.clickup_task_ids.join(", ")})`
              : ""}
            .
          </p>
        ) : mismatch.imported_from_clickup ? (
          <p className={`mt-1 ${detailClass}`}>
            ClickUp cache not available locally — check ClickUp directly for the true line count.
          </p>
        ) : null}
      </div>
    </div>
  );
}
