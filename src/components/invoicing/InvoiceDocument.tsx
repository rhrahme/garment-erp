import { InvoiceBankDetails } from "@/components/invoicing/InvoiceBankDetails";
import {
  formatInvoiceClientName,
  formatInvoiceClientRef,
  type CustomerInvoiceLineDisplay,
} from "@/lib/invoicing/display";
import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";
import { formatCurrency, formatDate } from "@/lib/utils";

function formatSar(amount: number): string {
  return formatCurrency(amount, "SAR");
}

export type InvoiceDocumentData = {
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  client_name: string;
  client_code: string;
  client_email: string | null;
  client_address: string | null;
  so_number: string;
  client_reference: string | null;
  payment_terms: string | null;
  currency: "SAR";
  total: number;
  notes: string | null;
  factory_brand_name: string | null;
  delivery_destination: DeliveryDestination | null;
  lines: CustomerInvoiceLineDisplay[];
};

export function InvoiceDocument({ invoice }: { invoice: InvoiceDocumentData }) {
  const clientRef = formatInvoiceClientRef(invoice.client_code, invoice.client_reference);

  return (
    <div className="invoice-document mx-auto max-w-3xl bg-white p-8 text-slate-900">
      <div className="mb-8 flex items-start justify-between border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tax invoice</p>
          <h1 className="mt-1 text-3xl font-bold">{invoice.invoice_number}</h1>
          <p className="mt-2 text-sm text-slate-600">Date: {formatDate(invoice.invoice_date)}</p>
          {invoice.due_date && <p className="text-sm text-slate-600">Due: {formatDate(invoice.due_date)}</p>}
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold">{invoice.factory_brand_name ?? "Garment Factory"}</p>
          <p className="text-slate-600">Riyadh, Saudi Arabia</p>
        </div>
      </div>

      <div className="mb-8 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to</p>
          <p className="mt-2 font-semibold">{formatInvoiceClientName(invoice.client_name)}</p>
          {invoice.client_email && <p className="mt-1 text-sm text-slate-600">{invoice.client_email}</p>}
          {invoice.client_address && <p className="mt-1 text-sm text-slate-600">{invoice.client_address}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reference</p>
          <p className="mt-2 text-sm">Sales order: {invoice.so_number}</p>
          {clientRef && <p className="text-sm text-slate-600">Client ref: {clientRef}</p>}
          {invoice.payment_terms && <p className="mt-1 text-sm text-slate-600">Terms: {invoice.payment_terms}</p>}
        </div>
      </div>

      <table className="mb-8 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3 text-center">Art.</th>
            <th className="py-2 pr-3">Garment</th>
            <th className="py-2 pr-3">Fabric</th>
            <th className="py-2 pr-3">Composition</th>
            <th className="py-2 pr-3">Weight</th>
            <th className="py-2 pr-3">Qty</th>
            <th className="py-2 pr-3">Unit price</th>
            <th className="py-2 pr-3 text-right">Amount</th>
            <th className="py-2 text-right" title="Internal cost per piece — fabric + 5% duty + make cost, excl. recoverable VAT">
              Cost hint
            </th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.id} className="border-b border-slate-100 align-top">
              <td className="py-3 pr-3 text-center font-semibold text-slate-900">{line.article_label}</td>
              <td className="py-3 pr-3">{line.description}</td>
              <td className="py-3 pr-3">{line.fabric_brand_label}</td>
              <td className="py-3 pr-3 text-slate-700">{line.composition_label}</td>
              <td className="py-3 pr-3 whitespace-nowrap">{line.weight_label}</td>
              <td className="py-3 pr-3">{line.quantity}</td>
              <td className="py-3 pr-3">{formatSar(line.unit_price)}</td>
              <td className="py-3 pr-3 text-right font-medium">{formatSar(line.line_total)}</td>
              <td className="py-3 text-right text-xs text-slate-500">
                {line.cost_hint_sar != null ? formatSar(line.cost_hint_sar) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={8} className="py-4 text-right font-semibold">
              Total ({invoice.currency})
            </td>
            <td className="py-4 text-right text-lg font-bold">{formatSar(invoice.total)}</td>
            <td className="py-4" />
          </tr>
        </tfoot>
      </table>

      {invoice.notes && (
        <div className="border-t border-slate-200 pt-4 text-sm text-slate-600">
          <p className="font-medium text-slate-700">Notes</p>
          <p className="mt-1 whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      <InvoiceBankDetails deliveryDestination={invoice.delivery_destination} />
    </div>
  );
}
