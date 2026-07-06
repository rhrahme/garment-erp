import type { SoFabricLineEmailStatus } from "@/lib/sales-orders/line-cross-reference";
import { formatDateTimeRiyadh } from "@/lib/utils";

export function FabricLineSupplierEmailCell({
  status,
}: {
  status: SoFabricLineEmailStatus | null | undefined;
}) {
  if (!status) {
    return <span className="text-slate-400">—</span>;
  }

  if (!status.poId) {
    return <span className="text-xs text-slate-400">No PO line</span>;
  }

  if (status.sent) {
    return (
      <div>
        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
          Email sent
        </span>
        {status.emailedAt ? (
          <p className="mt-1 text-xs text-slate-500">{formatDateTimeRiyadh(status.emailedAt)}</p>
        ) : null}
        {status.poNumber ? (
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">{status.poNumber}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        Pending email
      </span>
      {status.poNumber ? (
        <p className="mt-1 font-mono text-[11px] text-slate-400">{status.poNumber}</p>
      ) : null}
    </div>
  );
}
