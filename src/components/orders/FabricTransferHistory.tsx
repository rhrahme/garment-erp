"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FabricTransfer } from "@/lib/types/fabric-transfers";
import { formatDateTime } from "@/lib/utils";

export function FabricTransferHistory({ salesOrderId }: { salesOrderId: string }) {
  const [transfers, setTransfers] = useState<FabricTransfer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/fabric-transfers?sales_order_id=${encodeURIComponent(salesOrderId)}`)
      .then((res) => (res.ok ? res.json() : { transfers: [] }))
      .then((data: { transfers?: FabricTransfer[] }) => {
        if (!cancelled) setTransfers(data.transfers ?? []);
      })
      .catch(() => {
        if (!cancelled) setTransfers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [salesOrderId]);

  if (loading || transfers.length === 0) return null;

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Fabric transfer history</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Permanent audit of fabric moved to or from this order.
        </p>
      </div>
      <ul className="divide-y divide-slate-100">
        {transfers.map((transfer) => {
          const isSource = transfer.source.sales_order_id === salesOrderId;
          const isDest = transfer.destination.sales_order_id === salesOrderId;
          const role = isSource ? "Transferred out" : isDest ? "Received in" : "Replacement reorder";
          return (
            <li key={transfer.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-slate-900">{role}</span>
                <span className="text-xs text-slate-500">{formatDateTime(transfer.transferred_at)}</span>
              </div>
              <p className="mt-1 text-slate-700">
                {transfer.meters}m · {transfer.source.fabric_number} · {transfer.source.garment_type}
                {transfer.is_partial ? " (partial)" : ""}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {transfer.source.client_name} ({transfer.source.so_number})
                {" → "}
                {transfer.destination.client_name} ({transfer.destination.so_number})
              </p>
              <p className="mt-1 text-xs text-slate-500">
                By {transfer.transferred_by}: {transfer.reason}
              </p>
              <p className="mt-1 font-mono text-[11px] text-indigo-700">
                Was {transfer.source.sticker_codes[0] ?? "—"}
                {" → "}
                {transfer.destination.sticker_codes[0] ?? "—"}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <Link
                  href={`/orders/${transfer.source.sales_order_id}`}
                  className="text-indigo-700 hover:underline"
                >
                  Source {transfer.source.so_number}
                </Link>
                <Link
                  href={`/orders/${transfer.destination.sales_order_id}`}
                  className="text-indigo-700 hover:underline"
                >
                  Dest {transfer.destination.so_number}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
