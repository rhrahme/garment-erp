"use client";

import Link from "next/link";
import { ExternalLink, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DownloadInvoicePdfButton } from "@/components/invoicing/DownloadInvoicePdfButton";
import {
  InvoiceDocument,
  type InvoiceDocumentData,
} from "@/components/invoicing/InvoiceDocument";
import { INVOICE_PRINT_CSS } from "@/lib/invoicing/print-styles";

export function InvoicePreview({
  invoice,
  invoiceId,
}: {
  invoice: InvoiceDocumentData;
  invoiceId: string;
}) {
  return (
    <section className="invoice-preview space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <p className="font-medium text-slate-900">Invoice preview</p>
          <p className="text-xs text-slate-500">
            Matches the printed PDF — save line prices first, then download or print
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DownloadInvoicePdfButton
            invoiceId={invoiceId}
            invoiceNumber={invoice.invoice_number}
            size="sm"
          />
          <Link href={`/invoices/${invoiceId}/print`} target="_blank">
            <Button variant="secondary" size="sm">
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Open full page
            </Button>
          </Link>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <div className="invoice-preview-frame overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-4 md:p-8">
        <div className="invoice-preview-paper mx-auto w-full max-w-3xl shadow-lg ring-1 ring-slate-200">
          <InvoiceDocument invoice={invoice} />
        </div>
      </div>

      <style>{`
        ${INVOICE_PRINT_CSS}
        @media print {
          body * {
            visibility: hidden;
          }
          .invoice-preview,
          .invoice-preview * {
            visibility: visible;
          }
          .invoice-preview {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
          }
          .invoice-preview-frame {
            border: none;
            background: white;
            padding: 0;
            overflow: visible;
          }
          .invoice-preview-paper {
            box-shadow: none;
            ring: none;
            max-width: none;
          }
        }
      `}</style>
    </section>
  );
}
