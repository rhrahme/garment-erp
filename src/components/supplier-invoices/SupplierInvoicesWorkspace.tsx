"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataTable, PageHeader } from "@/components/ui/PageHeader";
import type { CustomsSummary } from "@/lib/integrations/customs-summary";
import type { SupplierInvoiceRecord } from "@/lib/integrations/supplier-invoice-store";
import type { TransporterInvoiceRecord } from "@/lib/integrations/transporter-invoice-store";
import { formatDate } from "@/lib/utils";

type SupplierInvoiceRow = SupplierInvoiceRecord & {
  transporter_invoices: TransporterInvoiceRecord[];
  customs_summary: CustomsSummary;
};

function formatAmount(amount: string | null, currency: string | null): string {
  if (!amount) return "—";
  return currency ? `${amount} ${currency}` : amount;
}

function customsBadgeClass(status: CustomsSummary["status"]): string {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-700";
    case "payment_due":
      return "bg-amber-100 text-amber-800";
    case "pending":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function SupplierInvoicesWorkspace() {
  const [invoices, setInvoices] = useState<SupplierInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (options?: { enrich?: boolean; silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const query = options?.enrich ? "?enrich=1" : "";
      const res = await fetch(`/api/supplier-invoices${query}`);
      const data = (await res.json()) as { invoices?: SupplierInvoiceRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load supplier invoices");
      setInvoices(data.invoices ?? []);
    } catch (err) {
      setInvoices([]);
      setError(err instanceof Error ? err.message : "Failed to load supplier invoices");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return invoices;
    return invoices.filter((invoice) => {
      const haystack = [
        invoice.supplier_name,
        invoice.supplier_id,
        invoice.invoice_number,
        invoice.po_number,
        invoice.subject,
        invoice.from_address,
        invoice.awb_numbers.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [invoices, search]);

  async function refreshAmounts() {
    setRefreshing(true);
    try {
      await load({ enrich: true, silent: true });
    } finally {
      setRefreshing(false);
    }
  }

  const rows = filtered.map((invoice) => {
    const awb = invoice.awb_numbers[0];
    const customs = invoice.customs_summary;

    return {
      received_at: formatDate(invoice.received_at),
      supplier: (
        <div>
          <p className="font-medium text-slate-900">{invoice.supplier_name ?? invoice.supplier_id ?? "Unknown supplier"}</p>
          {invoice.from_address && (
            <p className="mt-0.5 text-xs text-slate-500">{invoice.from_address}</p>
          )}
        </div>
      ),
      invoice: (
        <div>
          <p className="font-mono text-sm font-semibold text-slate-900">
            {invoice.invoice_number ?? invoice.id}
          </p>
          {invoice.po_number && (
            <p className="mt-0.5 text-xs text-slate-500">PO {invoice.po_number}</p>
          )}
        </div>
      ),
      amount: formatAmount(invoice.amount, invoice.currency),
      awb: awb ? (
        <Link href={`/shipments?awb=${encodeURIComponent(awb)}`} className="font-mono text-sm text-indigo-600 hover:underline">
          {awb}
        </Link>
      ) : (
        "—"
      ),
      customs: (
        <div className="space-y-1">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${customsBadgeClass(customs.status)}`}>
            {customs.status_label}
          </span>
          {customs.amount_due && (
            <p className="text-xs text-amber-800">Due {formatAmount(customs.amount_due, customs.currency)}</p>
          )}
          {customs.amount_paid && (
            <p className="text-xs text-emerald-700">Paid {formatAmount(customs.amount_paid, customs.currency)}</p>
          )}
          {customs.payment_url && (
            <a
              href={customs.payment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
            >
              Pay DHL
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      ),
      documents: (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/supplier-invoices/${invoice.id}/file`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
          >
            <FileText className="h-4 w-4" />
            Supplier PDF
          </a>
          {invoice.transporter_invoices.length > 0 && (
            <span className="text-xs text-slate-500">
              +{invoice.transporter_invoices.length} transporter
            </span>
          )}
          <a
            href={`/api/supplier-invoices/export?id=${encodeURIComponent(invoice.id)}`}
            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
          >
            <Download className="h-3 w-3" />
            ZIP
          </a>
        </div>
      ),
    };
  });

  return (
    <div>
      <PageHeader
        title="Supplier Invoices"
        description="Fabric supplier invoices and linked DHL/customs documents saved from inbox scan."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => void refreshAmounts()} disabled={refreshing || loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh amounts
            </Button>
            <a
              href="/api/supplier-invoices/export"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Download className="mr-2 h-4 w-4" />
              Export all
            </a>
            <Link
              href="/supplier-inbox"
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Scan inbox
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search supplier, invoice #, PO, AWB, subject…"
          className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <p className="text-sm text-slate-500">
          {loading ? "Loading…" : `${filtered.length} invoice${filtered.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Loading supplier invoices…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-slate-500">
            {invoices.length === 0
              ? "No supplier invoices saved yet."
              : "No invoices match your search."}
          </p>
          {invoices.length === 0 && (
            <p className="mt-2 text-sm text-slate-500">
              Run an inbox scan from{" "}
              <Link href="/supplier-inbox" className="font-medium text-indigo-600 hover:underline">
                Supplier Inbox
              </Link>{" "}
              to import fabric invoice PDFs.
            </p>
          )}
        </div>
      ) : (
        <DataTable
          columns={[
            { key: "received_at", label: "Received" },
            { key: "supplier", label: "Supplier" },
            { key: "invoice", label: "Invoice" },
            { key: "amount", label: "Amount" },
            { key: "awb", label: "AWB" },
            { key: "customs", label: "Customs" },
            { key: "documents", label: "Documents" },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
}
