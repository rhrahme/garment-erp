"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { FactoryBrandTabs } from "@/components/brands/FactoryBrandTabs";
import { StatusBadge } from "@/components/ui/PageHeader";
import { InvoiceSummaryCards } from "@/components/invoicing/InvoiceSummaryCards";
import { MASKED_INVOICE_AMOUNT } from "@/components/invoicing/InvoiceAmountsRevealToggle";
import { useInvoiceAmountsVisibility } from "@/hooks/useInvoiceAmountsVisibility";
import type { CustomerInvoice, CustomerInvoiceSummary } from "@/lib/types/customer-invoices";
import type { InvoiceableSalesOrder } from "@/lib/types/invoiceable-orders";
import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import { formatInvoiceClientName } from "@/lib/invoicing/display";
import { formatInvoiceSar } from "@/lib/invoicing/format-amount";
import {
  clientInvoiceWorkButtonLabel,
  describeClientInvoiceWork,
  groupClientInvoiceWork,
  type ClientInvoiceWork,
} from "@/lib/invoicing/client-invoice-work";
import { customerInvoiceMatchesSearch } from "@/lib/invoicing/list-search";
import { Button } from "@/components/ui/Button";
import { formatDate, cn } from "@/lib/utils";
import { useFactoryBrandFilter } from "@/hooks/useFactoryBrandFilter";
import { getFactoryBrands } from "@/lib/data/factory-brands";
import { InvoiceableOrdersPanel } from "@/components/invoicing/InvoiceableOrdersPanel";
import { DownloadCostHintPdfButton } from "@/components/costing/DownloadCostHintPdfButton";
import { costHintWorksheetQuery } from "@/lib/costing/cost-hint-worksheet-query";
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
  initialSearch = "",
  allowedBrandIds = null,
  canToggleAmounts = false,
  amountsVisibleByDefault = false,
  revealWithoutPassword = false,
}: {
  invoices: CustomerInvoice[];
  summary: CustomerInvoiceSummary;
  invoiceableOrders: InvoiceableSalesOrder[];
  initialSearch?: string;
  allowedBrandIds?: string[] | null;
  canToggleAmounts?: boolean;
  amountsVisibleByDefault?: boolean;
  revealWithoutPassword?: boolean;
}) {
  const { visible, hydrated, unlock, lock } = useInvoiceAmountsVisibility(amountsVisibleByDefault);
  /** Roles that can see amounts still start hidden; only an explicit Show click reveals. */
  const showAmounts = Boolean(canToggleAmounts && hydrated && visible);
  const scopedBrands = useMemo(() => {
    if (!allowedBrandIds) return undefined;
    const allowed = new Set(allowedBrandIds);
    return getFactoryBrands().filter((brand) => allowed.has(brand.id));
  }, [allowedBrandIds]);
  const isBrandScoped = Boolean(allowedBrandIds && allowedBrandIds.length > 0);
  const defaultBrandId = allowedBrandIds?.length === 1 ? allowedBrandIds[0]! : null;
  const { brandId, setBrandId, hydrated: brandFilterHydrated } = useFactoryBrandFilter(defaultBrandId);
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_TABS)[number]["id"]>("all");
  const [combiningClient, setCombiningClient] = useState<string | null>(null);
  const [combineError, setCombineError] = useState<string | null>(null);

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
  const searchScopedInvoices = useMemo(
    () =>
      searchQuery.trim()
        ? brandFilteredInvoices.filter((invoice) => customerInvoiceMatchesSearch(invoice, searchQuery))
        : brandFilteredInvoices,
    [brandFilteredInvoices, searchQuery]
  );
  const visibleInvoiceableOrders = useMemo(
    () =>
      searchQuery.trim()
        ? invoiceableOrders.filter((order) =>
            customerInvoiceMatchesSearch(
              {
                invoice_number: "",
                so_number: order.so_number,
                client_name: order.client_name,
                client_code: order.client_code,
              },
              searchQuery
            )
          )
        : invoiceableOrders,
    [invoiceableOrders, searchQuery]
  );
  const combinableGroups = useMemo(
    () => groupClientInvoiceWork(searchScopedInvoices, visibleInvoiceableOrders),
    [searchScopedInvoices, visibleInvoiceableOrders]
  );
  /** Only one open draft per client makes "add these orders" unambiguous. */
  const openDraftByClientCode = useMemo(() => {
    const drafts = new Map<string, { id: string; invoice_number: string } | null>();
    for (const invoice of searchScopedInvoices) {
      if (invoice.status !== "draft") continue;
      const code = invoice.client_code.trim();
      if (!code) continue;
      drafts.set(
        code,
        drafts.has(code) ? null : { id: invoice.id, invoice_number: invoice.invoice_number }
      );
    }
    return Object.fromEntries(
      [...drafts.entries()].filter((entry): entry is [string, { id: string; invoice_number: string }] =>
        entry[1] != null
      )
    );
  }, [searchScopedInvoices]);

  async function combineGroup(group: ClientInvoiceWork) {
    setCombiningClient(group.key);
    setCombineError(null);
    try {
      const res = await fetch("/api/customer-invoices/combine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_ids: group.drafts.map((invoice) => invoice.id),
          sales_order_ids: group.orders.map((order) => order.id),
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to combine invoices.");
      if (data.id) router.push(`/invoices/${data.id}`);
      router.refresh();
    } catch (err) {
      setCombineError(err instanceof Error ? err.message : "Failed to combine invoices.");
    } finally {
      setCombiningClient(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 text-sm text-violet-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">How invoicing works</p>
            <p className="mt-1 text-violet-900">
              Create a draft from <span className="font-medium">Ready to invoice</span> or a sales order page.
              Same-client sales orders can be one invoice. Matching garment + fibre + gsm lines combine.
              Prices prefill from costing (fabric + 5% duty + make cost). Adjust before{" "}
              <span className="font-medium">Mark as sent</span>, then{" "}
              <span className="font-medium">Mark paid</span> when collected.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canToggleAmounts ? (
              <>
                <DownloadCostHintPdfButton
                  href={`/api/costing/hint-pdf${costHintWorksheetQuery({ brandId })}`}
                  label="Download cost hint PDF"
                />
                <a
                  href={`/costing/print${costHintWorksheetQuery({ brandId })}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[40px] items-center rounded-lg border border-violet-200 px-3 py-2 text-sm font-semibold text-violet-900 hover:border-violet-300 hover:text-violet-950"
                >
                  Open cost hint print
                </a>
              </>
            ) : null}
            <RiyadhBankDetailsPdfLink variant="button" className="shrink-0 border-violet-200 text-violet-900 hover:border-violet-300 hover:text-violet-950" />
          </div>
        </div>
      </div>

      <InvoiceSummaryCards
        summary={summary}
        canToggleAmounts={canToggleAmounts}
        showAmounts={showAmounts}
        amountsVisible={visible}
        amountsHydrated={hydrated}
        onUnlock={unlock}
        onLock={lock}
        revealWithoutPassword={revealWithoutPassword}
      />

      {combineError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{combineError}</div>
      ) : null}
      {combinableGroups.map((group) => {
        const references = [
          ...group.drafts.map((invoice) => invoice.invoice_number),
          ...group.orders.map((order) => order.so_number),
        ].join(", ");
        return (
          <div
            key={group.key}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950"
          >
            <p>
              <span className="font-medium">{formatInvoiceClientName(group.client_name)}</span> has{" "}
              {describeClientInvoiceWork(group)} ({references}). Put them all on one invoice.
            </p>
            <Button size="sm" onClick={() => void combineGroup(group)} disabled={combiningClient != null}>
              {combiningClient === group.key ? "Combining…" : clientInvoiceWorkButtonLabel(group)}
            </Button>
          </div>
        );
      })}

      {brandFilterHydrated && (
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
                {canToggleAmounts ? <th className="px-4 py-3">Amount</th> : null}
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
                  {canToggleAmounts ? (
                    <td className="px-4 py-3 font-semibold">
                      {showAmounts ? formatInvoiceSar(invoice.total) : MASKED_INVOICE_AMOUNT}
                    </td>
                  ) : null}
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

      <InvoiceableOrdersPanel
        orders={visibleInvoiceableOrders}
        openDraftByClientCode={openDraftByClientCode}
        canViewAmounts={canToggleAmounts}
      />
    </div>
  );
}
