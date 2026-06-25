import Link from "next/link";
import type { InvoiceLineCrossRef } from "@/lib/sales-orders/line-cross-reference";
import { salesOrderFabricLineAnchor, supplierEmailsHref } from "@/lib/sales-orders/line-cross-reference";

export function InvoiceLineSoLink({
  salesOrderId,
  crossRef,
}: {
  salesOrderId: string;
  crossRef: InvoiceLineCrossRef;
}) {
  if (!crossRef.so_article_label || !crossRef.so_fabric_line_id) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <Link
      href={`/orders/${salesOrderId}#${salesOrderFabricLineAnchor(crossRef.so_fabric_line_id)}`}
      className="font-mono text-xs font-semibold text-indigo-600 hover:text-indigo-700"
      title={crossRef.sticker_suffix ?? undefined}
    >
      {crossRef.so_article_label}
    </Link>
  );
}

export function InvoiceLineFabricPoLink({
  salesOrderId,
  crossRef,
}: {
  salesOrderId: string;
  crossRef: InvoiceLineCrossRef;
}) {
  if (!crossRef.fabric_po_number) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <Link
      href={supplierEmailsHref(salesOrderId, crossRef.fabric_po_id)}
      className="font-mono text-xs text-indigo-600 hover:text-indigo-700"
    >
      {crossRef.fabric_po_number}
    </Link>
  );
}
