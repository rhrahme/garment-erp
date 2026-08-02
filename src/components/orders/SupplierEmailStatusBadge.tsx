import {
  supplierEmailStatusShortLabel,
  type SupplierEmailOrderStatus,
  type SupplierEmailOrderSummary,
} from "@/lib/sales-orders/supplier-email-status";

const STYLES: Record<SupplierEmailOrderStatus, string> = {
  sent: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-900",
  pending: "bg-amber-100 text-amber-800",
  none: "bg-slate-100 text-slate-500",
};

export function SupplierEmailStatusBadge({
  summary,
  className = "",
}: {
  summary: Pick<SupplierEmailOrderSummary, "status" | "sent" | "pending"> | null | undefined;
  className?: string;
}) {
  if (!summary || summary.status === "none") {
    return <span className={`text-slate-400 ${className}`.trim()}>-</span>;
  }

  const title =
    summary.status === "partial"
      ? `${summary.sent} emailed / ${summary.pending} pending`
      : summary.status === "pending"
        ? "Supplier email not sent yet — remind admin/purchasing if needed"
        : summary.status === "sent"
          ? "All linked supplier fabric emails have been sent"
          : undefined;

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[summary.status]} ${className}`.trim()}
      title={title}
    >
      {supplierEmailStatusShortLabel(summary)}
    </span>
  );
}
