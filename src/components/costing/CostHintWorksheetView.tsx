"use client";

import { COST_HINT_PRINT_CSS } from "@/lib/costing/cost-hint-print-styles";
import {
  costHintConstantColumns,
  costHintSwatchUrl,
  formatCostHintArticleSummary,
  formatCostHintComposition,
  formatCostHintMeters,
  formatCostHintWeight,
  summarizeCostHintArticles,
  uniqueCostHintSoNumbers,
  type CostHintWorksheet,
} from "@/lib/costing/cost-hint-worksheet";
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
  const soCount = uniqueCostHintSoNumbers(worksheet.rows).length;
  const constant = costHintConstantColumns(worksheet.rows);
  const showSo = constant.so_numbers == null;
  const showInvoice = constant.invoice_number == null;
  const showClient = constant.client_name == null;
  const showSuggested = worksheet.rows.some((row) => row.suggested_price_sar != null);
  const columnCount =
    14 + [showSo, showInvoice, showClient, showSuggested].filter(Boolean).length;
  const heading = worksheet.title.toUpperCase().startsWith("INTERNAL")
    ? worksheet.title
    : `INTERNAL - ${worksheet.title}`;
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

      <h1 className="text-xl font-bold">{heading}</h1>
      <p className="mt-1 text-sm text-slate-600">{worksheet.subtitle}</p>
      <p className="mt-1 text-xs text-slate-500">
        {worksheet.rows.length} lines. {soCount} sales order{soCount === 1 ? "" : "s"}.{" "}
        {worksheet.missing_price_count} missing fabric price.
      </p>
      {showSuggested ? (
        <p className="mt-1 text-xs text-slate-500">
          Suggested is what the same garment in the same cloth was charged elsewhere. Nobody has
          been billed it. Blank means the cloth has been priced two different ways.
        </p>
      ) : null}
      <p className="mt-2 text-sm font-semibold text-slate-900">
        {worksheet.article_summary ||
          formatCostHintArticleSummary(summarizeCostHintArticles(worksheet.rows))}
      </p>

      {showSo && showInvoice && showClient ? null : (
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-slate-700 sm:grid-cols-[auto_1fr]">
          {constant.client_name ? (
            <>
              <dt className="font-semibold text-slate-900">Client</dt>
              <dd>{constant.client_name}</dd>
            </>
          ) : null}
          {constant.invoice_number ? (
            <>
              <dt className="font-semibold text-slate-900">Invoice</dt>
              <dd className="font-mono">{constant.invoice_number}</dd>
            </>
          ) : null}
          {constant.so_numbers ? (
            <>
              <dt className="font-semibold text-slate-900">
                Sales order{constant.so_numbers.length === 1 ? "" : "s"}
              </dt>
              <dd className="font-mono">{constant.so_numbers.join(", ")}</dd>
            </>
          ) : null}
        </dl>
      )}

      <table className="mt-4 w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-900 text-left text-white">
            {showSo ? <th className="border border-slate-300 px-2 py-1.5">SO</th> : null}
            {showInvoice ? <th className="border border-slate-300 px-2 py-1.5">INV</th> : null}
            {showClient ? <th className="border border-slate-300 px-2 py-1.5">Client</th> : null}
            <th className="border border-slate-300 px-2 py-1.5">Art.</th>
            <th className="border border-slate-300 px-2 py-1.5">Garment</th>
            <th className="border border-slate-300 px-2 py-1.5">Swatch</th>
            <th className="border border-slate-300 px-2 py-1.5">Fabric</th>
            <th className="border border-slate-300 px-2 py-1.5">Brand</th>
            <th className="border border-slate-300 px-2 py-1.5">Comp.</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Weight</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Qty</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">SAR/m</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">
              {worksheet.meters_column_header ?? "Meters/pc"}
            </th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Fabric cost</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Cost hint</th>
            <th className="border border-slate-300 px-2 py-1.5 text-right">Unit price</th>
            {showSuggested ? (
              <th className="border border-slate-300 px-2 py-1.5 text-right">Suggested</th>
            ) : null}
            <th className="border border-slate-300 px-2 py-1.5">Write price</th>
          </tr>
        </thead>
        <tbody>
          {worksheet.rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="border border-slate-200 px-2 py-4 text-center text-slate-500">
                No costing lines for this filter.
              </td>
            </tr>
          ) : (
            worksheet.rows.map((row, index) => {
              const swatchUrl = costHintSwatchUrl(row.supplier_id, row.fabric_number);
              return (
                <tr key={`${row.so_number}-${row.article_label}-${row.fabric_number}-${index}`}>
                  {showSo ? (
                    <td className="border border-slate-200 px-2 py-1 font-mono">{row.so_number}</td>
                  ) : null}
                  {showInvoice ? (
                    <td className="border border-slate-200 px-2 py-1 font-mono">{row.invoice_number ?? "-"}</td>
                  ) : null}
                  {showClient ? (
                    <td className="border border-slate-200 px-2 py-1">{row.client_name}</td>
                  ) : null}
                  <td className="border border-slate-200 px-2 py-1 text-center">{row.article_label}</td>
                  <td className="border border-slate-200 px-2 py-1">{row.garment}</td>
                  <td className="border border-slate-200 px-1 py-1 text-center">
                    {swatchUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={swatchUrl}
                        alt=""
                        width={28}
                        height={28}
                        className="mx-auto h-7 w-7 rounded-sm object-cover"
                      />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 font-mono">{row.fabric_number || "-"}</td>
                  <td className="border border-slate-200 px-2 py-1">{row.fabric_brand || "-"}</td>
                  <td className="border border-slate-200 px-2 py-1">{formatCostHintComposition(row.composition)}</td>
                  <td className="border border-slate-200 px-2 py-1 text-right">{formatCostHintWeight(row.weight_gsm)}</td>
                  <td className="border border-slate-200 px-2 py-1 text-right">{row.quantity}</td>
                  <td className="border border-slate-200 px-2 py-1 text-right">
                    {money(row.price_per_meter_sar)}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 text-right">
                    {formatCostHintMeters(row.meters_per_piece)}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 text-right">{money(row.fabric_cost_sar)}</td>
                  <td className="border border-slate-200 px-2 py-1 text-right font-semibold">
                    {money(row.cost_hint_sar)}
                  </td>
                  <td className="border border-slate-200 px-2 py-1 text-right">{money(row.unit_price_sar)}</td>
                  {showSuggested ? (
                    <td className="border border-slate-200 px-2 py-1 text-right">
                      {row.suggested_price_sar == null ? (
                        "-"
                      ) : (
                        <>
                          {money(row.suggested_price_sar)}
                          {row.suggested_price_basis ? (
                            <span className="block text-[10px] font-normal text-slate-500">
                              {row.suggested_price_basis}
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>
                  ) : null}
                  <td className="border border-slate-200 px-2 py-1">&nbsp;</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
