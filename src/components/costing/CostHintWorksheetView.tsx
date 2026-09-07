"use client";

import { COST_HINT_PRINT_CSS } from "@/lib/costing/cost-hint-print-styles";
import type { CostHintWorksheet } from "@/lib/costing/cost-hint-worksheet";
import { formatInvoiceSar } from "@/lib/invoicing/format-amount";

function money(amount: number | null): string {
  return amount == null ? "-" : formatInvoiceSar(amount);
}

export function CostHintWorksheetView({
  worksheet,
  pdfHref,
}: {
  worksheet: CostHintWorksheet;
  pdfHref: string;
}) {
  return (
    <div className="min-h-screen bg-white p-6 text-slate-900 print:p-0">
      <style>{COST_HINT_PRINT_CSS}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Internal worksheet. Print or download the PDF to work offline. Do not send this to the
          client.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={pdfHref}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Download PDF
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Print
          </button>
        </div>
      </div>

      <h1 className="text-xl font-bold">INTERNAL - cost hint worksheet</h1>
      <p className="mt-1 text-sm text-slate-600">{worksheet.subtitle}</p>
      <p className="mt-1 text-xs text-slate-500">
        {worksheet.rows.length} lines. {worksheet.missing_price_count} missing fabric price.
      </p>

      <table className="mt-4 w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-900 text-left text-white">
            <th className="border border-slate-300 px-2 py-1.5">SO</th>
            <th className="border border-slate-300 px-2 py-1.5">INV</th>
            <th className="border border-slate-300 px-2 py-1.5">Client</th>
            <th className="border border-slate-300 px-2 py-1.5">Art.</th>
            <th className="border border-slate-300 px-2 py-1.5">Garment</th>
            <th className="border border-slate-300 px-2 py-1.5">Fabric</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Qty</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Fabric cost</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Cost hint</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Unit price</th>
            <th className="border border-slate-300 px-2 py-1.5">Write price</th>
          </tr>
        </thead>
        <tbody>
          {worksheet.rows.length === 0 ? (
            <tr>
              <td colSpan={11} className="border border-slate-200 px-2 py-4 text-center text-slate-500">
                No costing lines for this filter.
              </td>
            </tr>
          ) : (
            worksheet.rows.map((row, index) => (
              <tr key={`${row.so_number}-${row.article_label}-${row.fabric_number}-${index}`}>
                <td className="border border-slate-200 px-2 py-1 font-mono">{row.so_number}</td>
                <td className="border border-slate-200 px-2 py-1 font-mono">{row.invoice_number ?? "-"}</td>
                <td className="border border-slate-200 px-2 py-1">{row.client_name}</td>
                <td className="border border-slate-200 px-2 py-1 text-center">{row.article_label}</td>
                <td className="border border-slate-200 px-2 py-1">{row.garment}</td>
                <td className="border border-slate-200 px-2 py-1 font-mono">{row.fabric_number || "-"}</td>
                <td className="border border-slate-200 px-2 py-1 text-right">{row.quantity}</td>
                <td className="border border-slate-200 px-2 py-1 text-right">{money(row.fabric_cost_sar)}</td>
                <td className="border border-slate-200 px-2 py-1 text-right font-semibold">
                  {money(row.cost_hint_sar)}
                </td>
                <td className="border border-slate-200 px-2 py-1 text-right">{money(row.unit_price_sar)}</td>
                <td className="border border-slate-200 px-2 py-1">&nbsp;</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
