"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/PageHeader";
import type { InvoiceableSalesOrder } from "@/lib/types/invoiceable-orders";
import { formatCurrency, formatDate } from "@/lib/utils";

function formatSar(amount: number | null): string {
  if (amount == null) return "—";
  return formatCurrency(amount, "SAR");
}

export function InvoiceableOrdersPanel({ orders }: { orders: InvoiceableSalesOrder[] }) {
  const router = useRouter();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createInvoice(salesOrderId: string) {
    setCreatingId(salesOrderId);
    setError(null);
    try {
      const res = await fetch("/api/customer-invoices/from-sales-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales_order_id: salesOrderId }),
      });
      const data = (await res.json()) as {
        id?: string;
        error?: string;
        invoice?: { id: string };
      };
      if (res.status === 409 && data.invoice?.id) {
        router.push(`/invoices/${data.invoice.id}`);
        router.refresh();
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to create invoice.");
      router.push(`/invoices/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice.");
    } finally {
      setCreatingId(null);
    }
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-5 py-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Ready to invoice</p>
        <p className="mt-1">
          No bespoke orders waiting for an invoice. When a sales order is ready to bill, it appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Ready to invoice</h3>
          <p className="text-sm text-slate-600">
            {orders.length} bespoke order{orders.length !== 1 ? "s" : ""} without an invoice yet
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-emerald-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-emerald-100 bg-emerald-50/80 text-left text-xs font-medium uppercase tracking-wide text-emerald-800">
              <th className="px-4 py-3">Sales order</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Order date</th>
              <th className="px-4 py-3">Pieces</th>
              <th className="px-4 py-3">Est. cost</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3 font-mono font-medium text-indigo-700">{order.so_number}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{order.client_name}</p>
                  <p className="font-mono text-xs text-slate-500">{order.client_code}</p>
                </td>
                <td className="px-4 py-3">{formatDate(order.order_date)}</td>
                <td className="px-4 py-3">
                  {order.piece_count} pc · {order.fabric_line_count} fabric
                  {order.fabric_line_count !== 1 ? "s" : ""}
                </td>
                <td className="px-4 py-3 text-slate-700">{formatSar(order.estimated_cost_sar)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    onClick={() => void createInvoice(order.id)}
                    disabled={creatingId != null}
                  >
                    <FilePlus2 className="mr-1.5 h-4 w-4" />
                    {creatingId === order.id ? "Creating…" : "Create invoice"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
