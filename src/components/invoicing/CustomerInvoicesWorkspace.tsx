"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Search, Wallet } from "lucide-react";
import { StatCard, StatusBadge } from "@/components/ui/PageHeader";
import type { CustomerInvoice, CustomerInvoiceSummary } from "@/lib/types/customer-invoices";
import type { InvoiceableSalesOrder } from "@/lib/types/invoiceable-orders";
import { formatInvoiceClientName } from "@/lib/invoicing/display";
import { formatCurrency, formatDate } from "@/lib/utils";
import { InvoiceableOrdersPanel } from "@/components/invoicing/InvoiceableOrdersPanel";

function formatSar(amount: number): string {
  return formatCurrency(amount, "SAR");
}

const STATUS_FILTER_OPTIONS = ["all", "draft", "sent", "paid"] as const;

export function CustomerInvoicesWorkspace({
  invoices,
  summary,
  invoiceableOrders,
}: {
  invoices: CustomerInvoice[];
  summary: CustomerInvoiceSummary;
  invoiceableOrders: InvoiceableSalesOrder[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTER_OPTIONS)[number]>("all");

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (statusFilter !== "all" && invoice.status !== statusFilter) return false;
      if (!query) return true;
      return [
        invoice.invoice_number,
        invoice.so_number,
        invoice.client_name,
        invoice.client_code,
        invoice.client_reference,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [invoices, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      <InvoiceableOrdersPanel orders={invoiceableOrders} />

      <div className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 text-sm text-violet-950">
        <p className="font-medium">How invoicing works</p>
        <p className="mt-1 text-violet-900">
          Create a draft from <span className="font-medium">Ready to invoice</span> or a sales order page.
          One invoice per bespoke order — lines are one per garment piece. Prices prefill from costing (fabric +
          5% duty + make cost). Adjust before <span className="font-medium">Mark sent</span>, then{" "}
          <span className="font-medium">Mark paid</span> when collected.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Invoices"
          value={summary.invoice_count}
          subtext={`${summary.draft_count} draft`}
          icon={<FileText className="h-5 w-5" />}
          accent="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="Outstanding"
          value={formatSar(summary.outstanding_sar)}
          subtext={`${summary.sent_count} sent · ${summary.draft_count} draft`}
          icon={<Wallet className="h-5 w-5" />}
          accent="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Paid"
          value={formatSar(summary.paid_sar)}
          subtext={`${summary.paid_count} invoice${summary.paid_count !== 1 ? "s" : ""}`}
          accent="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Currency"
          value="SAR"
          subtext="Client billing"
          accent="bg-sky-50 text-sky-600"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="relative block max-w-md flex-1 text-sm">
          <span className="font-medium text-slate-700">Search</span>
          <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Invoice #, client, SO…"
            className="mt-1 block w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_FILTER_OPTIONS)[number])}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          {invoices.length === 0 ? (
            <>
              No invoices yet. Use <span className="font-medium">Create invoice</span> in the table above, or open a
              sales order.
            </>
          ) : (
            "No invoices match your filters."
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Sales order</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-mono font-medium text-slate-900">{invoice.invoice_number}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{formatInvoiceClientName(invoice.client_name)}</p>
                    <p className="font-mono text-xs text-slate-500">{invoice.client_code}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-indigo-700">{invoice.so_number}</td>
                  <td className="px-4 py-3">{formatDate(invoice.invoice_date)}</td>
                  <td className="px-4 py-3">{invoice.due_date ? formatDate(invoice.due_date) : "—"}</td>
                  <td className="px-4 py-3 font-semibold">{formatSar(invoice.total)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/invoices/${invoice.id}`} className="font-medium text-indigo-600 hover:text-indigo-700">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
