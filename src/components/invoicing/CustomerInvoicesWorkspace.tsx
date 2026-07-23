"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { FactoryBrandTabs } from "@/components/brands/FactoryBrandTabs";
import { StatusBadge } from "@/components/ui/PageHeader";
import { InvoiceSummaryCards } from "@/components/invoicing/InvoiceSummaryCards";
import type { CustomerInvoice, CustomerInvoiceSummary } from "@/lib/types/customer-invoices";
import type { InvoiceableSalesOrder } from "@/lib/types/invoiceable-orders";
import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import { formatInvoiceClientName } from "@/lib/invoicing/display";
import { formatInvoiceSar } from "@/lib/invoicing/format-amount";
import { customerInvoiceMatchesSearch } from "@/lib/invoicing/list-search";
import { formatDate, cn } from "@/lib/utils";
import { useFactoryBrandFilter } from "@/hooks/useFactoryBrandFilter";
import { getFactoryBrands } from "@/lib/data/factory-brands";
import { InvoiceableOrdersPanel } from "@/components/invoicing/InvoiceableOrdersPanel";
import { RiyadhBankDetailsPdfLink } from "@/components/invoicing/RiyadhBankDetailsPdfLink";

const STATUS_TABS = [
  { id: "all" as const, label: "All" },
  { id: "draft" as const, label: "Draft" },
  { id: "sent" as const, label: "Sent" },
  { id: "paid" as const, label: "Paid" },
];

export function CustomerInvoicesWorkspace({
  invoices,
  summary,
  invoiceableOrders,
  allowedBrandIds = null,
}: {
  invoices: CustomerInvoice[];
  summary: CustomerInvoiceSummary;
  invoiceableOrders: InvoiceableSalesOrder[];
  allowedBrandIds?: string[] | null;
}) {
  const scopedBrands = useMemo(() => {
    if (!allowedBrandIds) return undefined;
    const allowed = new Set(allowedBrandIds);
    return getFactoryBrands().filter((brand) => allowed.has(brand.id));
  }, [allowedBrandIds]);
  const isBrandScoped = Boolean(allowedBrandIds && allowedBrandIds.length > 0);
  const defaultBrandId = allowedBrandIds?.length === 1 ? allowedBrandIds[0]! : null;
  const { brandId, setBrandId, hydrated } = useFactoryBrandFilter(defaultBrandId);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_TABS)[number]["id"]>("all");

  const brandFilteredInvoices = useMemo(() => {
    if (!brandId) return invoices;
    const prefix = getBrandClientCodePrefix(brandId);
    if (!prefix) return invoices;
    return invoices.filter(
      (invoice) => invoice.client_code.startsWith(`${prefix}-`) || invoice.client_code === prefix
    );
  }, [brandId, invoices]);

  const tabCounts = useMemo(
    () => ({
      all: brandFilteredInvoices.length,
      draft: brandFilteredInvoices.filter((invoice) => invoice.status === "draft").length,
      sent: brandFilteredInvoices.filter((invoice) => invoice.status === "sent").length,
      paid: brandFilteredInvoices.filter((invoice) => invoice.status === "paid").length,
    }),
    [brandFilteredInvoices]
  );

  const filtered = useMemo(() => {
    return brandFilteredInvoices.filter((invoice) => {
      if (statusFilter !== "all" && invoice.status !== statusFilter) return false;
      return customerInvoiceMatchesSearch(invoice, searchQuery);
    });
  }, [brandFilteredInvoices, searchQuery, statusFilter]);

  const hasActiveFilters = Boolean(searchQuery.trim() || brandId || statusFilter !== "all");

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 text-sm text-violet-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">How invoicing works</p>
            <p className="mt-1 text-violet-900">
              Create a draft from <span className="font-medium">Ready to invoice</span> or a sales order page.
              One invoice per bespoke order — lines are one per garment piece. Prices prefill from costing (fabric +
              5% duty + make cost). Adjust before <span className="font-medium">Mark as sent</span>, then{" "}
              <span className="font-medium">Mark paid</span> when collected.
            </p>
          </div>
          <RiyadhBankDetailsPdfLink variant="button" className="shrink-0 border-violet-200 text-violet-900 hover:border-violet-300 hover:text-violet-950" />
        </div>
      </div>

      <InvoiceSummaryCards summary={summary} />

      {hydrated && (
        <FactoryBrandTabs
          value={brandId}
          onChange={setBrandId}
          showAll={!isBrandScoped}
          allLabel="All brands"
          label="Filter by brand"
          brands={scopedBrands}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                statusFilter === tab.id
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              {tab.label}
              <span className="ml-1.5 text-xs opacity-80">({tabCounts[tab.id]})</span>
            </button>
          ))}
        </div>
        <label className="relative block w-full max-w-md text-sm sm:w-auto">
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
        {hasActiveFilters && invoices.length > 0 && (
          <p className="text-sm text-slate-500">
            {filtered.length} of {brandFilteredInvoices.length} invoice
            {brandFilteredInvoices.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          {invoices.length === 0 ? (
            <>
              No invoices yet. Use <span className="font-medium">Create invoice</span> in Ready to invoice below, or open a
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
                <th className="px-4 py-3">Sent</th>
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
                  <td className="px-4 py-3">
                    {invoice.sent_at ? formatDate(invoice.sent_at.slice(0, 10)) : "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold">{formatInvoiceSar(invoice.total)}</td>
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

      <InvoiceableOrdersPanel orders={invoiceableOrders} />
    </div>
  );
}
