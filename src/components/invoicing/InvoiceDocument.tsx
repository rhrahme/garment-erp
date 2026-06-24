import { InvoiceBankDetails } from "@/components/invoicing/InvoiceBankDetails";
import { InvoiceTotalsFooter } from "@/components/invoicing/InvoiceTotalsFooter";
import {
  formatInvoiceClientName,
  formatInvoiceClientRef,
  type CustomerInvoiceLineDisplay,
} from "@/lib/invoicing/display";
import { getInvoiceIssuerDetails, isDubaiFabricDelivery } from "@/lib/invoicing/bank-details";
import type { DeliveryDestination } from "@/lib/shipping/delivery-destinations";
import { formatInvoiceSar } from "@/lib/invoicing/format-amount";
import { formatDate } from "@/lib/utils";

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
  subtotal: number;
  vat_rate: number | null;
  vat_amount: number;
  total: number;
  factory_brand_name: string | null;
  delivery_destination: DeliveryDestination | null;
  lines: CustomerInvoiceLineDisplay[];
};

export function InvoiceDocument({ invoice }: { invoice: InvoiceDocumentData }) {
  const clientRef = formatInvoiceClientRef(invoice.client_code, invoice.client_reference);
  const issuer = getInvoiceIssuerDetails(invoice.delivery_destination, invoice.factory_brand_name);
  const showDhsEquivalent = isDubaiFabricDelivery(invoice.delivery_destination);

  return (
    <div className="invoice-document mx-auto max-w-3xl bg-white p-8 text-slate-900">
      <div className="mb-8 flex items-start justify-between border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold">{invoice.invoice_number}</h1>
          <p className="mt-2 text-sm text-slate-600">Date: {formatDate(invoice.invoice_date)}</p>
          {invoice.due_date && <p className="text-sm text-slate-600">Due: {formatDate(invoice.due_date)}</p>}
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold">{issuer.company_name}</p>
          <p className="text-slate-600">{issuer.location_line}</p>
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
            <th className="py-2 pr-3">Composition</th>
            <th className="py-2 pr-3">Qty</th>
            <th className="py-2 pr-3">Unit price</th>
            <th className="py-2 pr-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.id} className="border-b border-slate-100 align-top">
              <td className="py-3 pr-3 text-center font-semibold text-slate-900">{line.article_label}</td>
              <td className="py-3 pr-3">{line.description}</td>
              <td className="py-3 pr-3 text-slate-700">{line.composition_label}</td>
              <td className="py-3 pr-3">{line.quantity}</td>
              <td className="py-3 pr-3">{formatInvoiceSar(line.unit_price)}</td>
              <td className="py-3 pr-3 text-right font-medium">{formatInvoiceSar(line.line_total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <InvoiceTotalsFooter
            currency={invoice.currency}
            subtotal={invoice.subtotal}
            vatRate={invoice.vat_rate}
            vatAmount={invoice.vat_amount}
            total={invoice.total}
            showDhsEquivalent={showDhsEquivalent}
            variant="print"
          />
        </tfoot>
      </table>

      <InvoiceBankDetails deliveryDestination={invoice.delivery_destination} />
    </div>
  );
}
