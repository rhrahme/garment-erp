"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/PageHeader";
import { InvoicePreview } from "@/components/invoicing/InvoicePreview";
import type { CustomerInvoice, CustomerInvoiceLine, CustomerInvoiceStatus } from "@/lib/types/customer-invoices";
import {
  formatInvoiceClientName,
  resolveInvoiceLines,
  sortInvoiceLinesByArticle,
  toInvoiceLineDisplay,
} from "@/lib/invoicing/display";
import { sarToDhs } from "@/lib/currency/config";
import { isDubaiFabricDelivery } from "@/lib/invoicing/bank-details";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

function formatSar(amount: number): string {
  return formatCurrency(amount, "SAR");
}

function formatDhs(amount: number): string {
  return `${formatNumber(amount, 2)} DHS`;
}

export function InvoiceEditor({ invoice: initial }: { invoice: CustomerInvoice }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState(initial);
  const [lines, setLines] = useState<CustomerInvoiceLine[]>(initial.lines);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function savePatch(
    patch: Record<string, unknown>,
    options?: { refresh?: boolean }
  ): Promise<CustomerInvoice | null> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/customer-invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as CustomerInvoice & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save invoice.");
      setInvoice(data);
      setLines(resolveInvoiceLines(data.lines));
      if (options?.refresh !== false) router.refresh();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save invoice.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveLines() {
    await savePatch({ lines: resolveInvoiceLines(lines) });
  }

  async function updateStatus(status: CustomerInvoiceStatus) {
    await savePatch({ status, lines: resolveInvoiceLines(lines) });
  }

  function updateLine(id: string, field: "unit_price" | "description", value: string) {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) return line;
        if (field === "unit_price") {
          const unitPrice = Number.parseFloat(value);
          const safePrice = Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : line.unit_price;
          return { ...line, unit_price: safePrice, line_total: safePrice * line.quantity };
        }
        return { ...line, description: value };
      })
    );
  }

  const liveSubtotal = lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
  const liveVatAmount =
    invoice.vat_rate != null && invoice.vat_rate > 0
      ? Math.round(liveSubtotal * invoice.vat_rate * 100) / 100
      : 0;
  const liveTotal = Math.round((liveSubtotal + liveVatAmount) * 100) / 100;

  const showDhsEquivalent = isDubaiFabricDelivery(invoice.delivery_destination);
  const dhsSubtotal = showDhsEquivalent ? sarToDhs(liveSubtotal) : null;
  const dhsVatAmount =
    showDhsEquivalent && invoice.vat_rate != null && invoice.vat_rate > 0
      ? sarToDhs(liveVatAmount)
      : null;
  const dhsTotal = showDhsEquivalent ? sarToDhs(liveTotal) : null;

  const previewInvoice = useMemo(
    () => ({
      ...invoice,
      delivery_destination: invoice.delivery_destination ?? null,
      subtotal: liveSubtotal,
      vat_amount: liveVatAmount,
      total: liveTotal,
      lines: sortInvoiceLinesByArticle(resolveInvoiceLines(lines)).map((line) =>
        toInvoiceLineDisplay({
          ...line,
          line_total: Math.round(line.quantity * line.unit_price * 100) / 100,
        })
      ),
    }),
    [invoice, lines, liveSubtotal, liveVatAmount, liveTotal]
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-900">{invoice.invoice_number}</h2>
            <StatusBadge status={invoice.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {formatInvoiceClientName(invoice.client_name)} · SO{" "}
            <Link href={`/orders/${invoice.sales_order_id}`} className="font-mono text-indigo-600 hover:text-indigo-700">
              {invoice.so_number}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/invoices/${invoice.id}/print`} target="_blank">
            <Button variant="secondary">Open print page</Button>
          </Link>
          {invoice.status === "draft" && (
            <Button onClick={() => void updateStatus("sent")} disabled={saving}>
              Mark sent
            </Button>
          )}
          {invoice.status !== "paid" && (
            <Button variant="secondary" onClick={() => void updateStatus("paid")} disabled={saving}>
              Mark paid
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Invoice date</span>
          <input
            type="date"
            value={invoice.invoice_date}
            onChange={(e) => void savePatch({ invoice_date: e.target.value, lines }, { refresh: false })}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Due date</span>
          <input
            type="date"
            value={invoice.due_date ?? ""}
            onChange={(e) =>
              void savePatch({ due_date: e.target.value || null, lines }, { refresh: false })
            }
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Payment terms</span>
          <input
            type="text"
            value={invoice.payment_terms ?? ""}
            onChange={(e) =>
              void savePatch({ payment_terms: e.target.value, lines }, { refresh: false })
            }
            placeholder="e.g. Net 30"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 text-center">Art.</th>
              <th className="px-4 py-3">Garment</th>
              <th className="px-4 py-3">Composition</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Unit price (SAR)</th>
              <th className="px-4 py-3">Line total</th>
              <th className="px-4 py-3" title="Internal cost per piece — fabric + 5% duty + make cost, excl. recoverable VAT">
                Cost hint
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortInvoiceLinesByArticle(resolveInvoiceLines(lines)).map((line) => {
              const display = toInvoiceLineDisplay(line);
              return (
              <tr key={line.id}>
                <td className="px-4 py-3 text-center font-semibold text-slate-900">{display.article_label}</td>
                <td className="px-4 py-3">
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(line.id, "description", e.target.value)}
                    className="w-full min-w-[12rem] rounded border border-slate-200 px-2 py-1.5"
                  />
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{display.composition_label}</td>
                <td className="px-4 py-3">{line.quantity}</td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={line.unit_price}
                    onChange={(e) => updateLine(line.id, "unit_price", e.target.value)}
                    className="w-28 rounded border border-slate-200 px-2 py-1.5"
                  />
                </td>
                <td className="px-4 py-3 font-medium">{formatSar(line.quantity * line.unit_price)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {line.cost_hint_sar != null ? formatSar(line.cost_hint_sar) : "—"}
                </td>
              </tr>
            );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 text-slate-600">
              <td className="px-4 py-2" colSpan={5}>
                Subtotal
              </td>
              <td className="px-4 py-2">{formatSar(liveSubtotal)}</td>
              <td className="px-4 py-2" />
            </tr>
            {dhsSubtotal != null && (
              <tr className="text-slate-500">
                <td className="px-4 pb-2" colSpan={5}>
                  Subtotal (DHS)
                </td>
                <td className="px-4 pb-2 font-medium text-slate-600">{formatDhs(dhsSubtotal)}</td>
                <td className="px-4 pb-2" />
              </tr>
            )}
            {invoice.vat_rate != null && invoice.vat_rate > 0 && (
              <tr className="text-slate-600">
                <td className="px-4 py-2" colSpan={5}>
                  VAT ({Math.round(invoice.vat_rate * 100)}%)
                </td>
                <td className="px-4 py-2">{formatSar(liveVatAmount)}</td>
                <td className="px-4 py-2" />
              </tr>
            )}
            {dhsVatAmount != null && (
              <tr className="text-slate-500">
                <td className="px-4 pb-2" colSpan={5}>
                  VAT (DHS)
                </td>
                <td className="px-4 pb-2 font-medium text-slate-600">{formatDhs(dhsVatAmount)}</td>
                <td className="px-4 pb-2" />
              </tr>
            )}
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
              <td className="px-4 py-3" colSpan={5}>
                Total
              </td>
              <td className="px-4 py-3">{formatSar(liveTotal)}</td>
              <td className="px-4 py-3" />
            </tr>
            {dhsTotal != null && (
              <tr className="bg-slate-50 font-semibold text-slate-700">
                <td className="px-4 pb-3" colSpan={5}>
                  Equivalent in UAE Dirhams (DHS)
                </td>
                <td className="px-4 pb-3 font-bold text-slate-800">{formatDhs(dhsTotal)}</td>
                <td className="px-4 pb-3" />
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void saveLines()} disabled={saving}>
          {saving ? "Saving…" : "Save line prices"}
        </Button>
        <Link href="/invoices">
          <Button variant="secondary">All invoices</Button>
        </Link>
      </div>

      <InvoicePreview invoice={previewInvoice} invoiceId={invoice.id} />

      {(invoice.sent_at || invoice.paid_at) && (
        <p className="text-xs text-slate-500">
          {invoice.sent_at ? `Sent ${formatDate(invoice.sent_at.slice(0, 10))}` : null}
          {invoice.sent_at && invoice.paid_at ? " · " : null}
          {invoice.paid_at ? `Paid ${formatDate(invoice.paid_at.slice(0, 10))}` : null}
        </p>
      )}
    </div>
  );
}
