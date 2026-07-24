"use client";

import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { qrImageUrl } from "@/lib/production/qr-labels";
import { formatMeasurement, unitLabel } from "@/lib/pattern-library/measurements";
import { basePatternLabelCode, basePatternQrUrl } from "@/lib/pattern-library/pattern-qr";
import { buildBaseSizeSheetRows } from "@/lib/pattern-library/size-sheet";
import type { BasePattern } from "@/lib/types/pattern-library";

const SHEET_PRINT_CSS = `
@page { size: A4 portrait; margin: 10mm; }
@media print {
  .no-print { display: none !important; }
  .pattern-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; }
  .pattern-sheet table { page-break-inside: auto; }
  .pattern-sheet tr { page-break-inside: avoid; }
}
`;

/**
 * Per-size A4 working sheet — the owner's traditional client-sheet layout for
 * one size of a base pattern: base values pre-filled, trial columns left empty
 * for handwriting during fittings.
 */
export function BaseSizeSheetPrintView({ base, size }: { base: BasePattern; size: string }) {
  const rows = buildBaseSizeSheetRows(base, size);
  const labelCode = basePatternLabelCode(base);
  const qrPayload = basePatternQrUrl(base.id);

  return (
    <div className="mx-auto min-h-screen max-w-[210mm] bg-white p-6 text-slate-900 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: SHEET_PRINT_CSS }} />

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <Link
            href={`/pattern/library/bases/${base.id}`}
            className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            ← Back to {base.name}
          </Link>
          <p className="mt-1 text-xs text-slate-500">A4 portrait · size {size} working sheet</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/pattern/library/bases/${base.id}/size-pdf?size=${encodeURIComponent(size)}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      <div className="pattern-sheet rounded-xl border border-slate-200 p-6 shadow-sm">
        {/* Top row: title + house brand block */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">PATTERN WORKING SHEET</h1>
            <p className="mt-1 font-mono text-sm font-semibold">{labelCode}</p>
          </div>
          <div className="rounded-lg border-2 border-slate-900 px-4 py-2 text-center">
            <p className="text-2xl font-black tracking-widest">{base.house_brand_code}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">House brand</p>
          </div>
        </div>

        {/* Header block + fixed pattern QR */}
        <div className="mt-4 flex gap-4">
          <table className="flex-1 text-sm">
            <tbody>
              {[
                ["Cut family", base.cut_family],
                ["Garment", base.garment_type],
                ["Variant", base.cut_variant ?? "—"],
                ["Size", size],
                ["Pattern ref", labelCode],
                ["Date", new Date().toLocaleDateString("en-GB")],
              ].map(([label, value]) => (
                <tr key={label} className="border-b border-slate-200">
                  <td className="w-28 py-1 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </td>
                  <td className="py-1 font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="shrink-0 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrImageUrl(qrPayload, 200)} alt={labelCode} className="h-28 w-28" />
            <p className="mt-1 max-w-32 break-all font-mono text-[9px] leading-tight">{labelCode}</p>
          </div>
        </div>

        {/* Working grid: base value pre-filled, trial columns empty for handwriting */}
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-900 text-left text-[10px] font-bold uppercase tracking-wide">
              <th className="border border-slate-300 px-1.5 py-1.5">
                Point ({unitLabel(base.unit)})
              </th>
              <th className="border border-slate-300 px-1.5 py-1.5 text-center">Size {size}</th>
              <th className="border border-slate-300 px-1.5 py-1.5 text-center">Sewing</th>
              <th className="border border-slate-300 px-1.5 py-1.5 text-center">Adjust</th>
              <th className="border border-slate-300 px-1.5 py-1.5 text-center">Trial 1</th>
              <th className="border border-slate-300 px-1.5 py-1.5 text-center">Sewing</th>
              <th className="border border-slate-300 px-1.5 py-1.5 text-center">Trial 2</th>
              <th className="border border-slate-300 px-1.5 py-1.5 text-center">Sewing</th>
              <th className="border border-slate-300 px-1.5 py-1.5 text-center">Final</th>
              <th className="border border-slate-300 px-1.5 py-1.5">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.point_id}>
                <td className="border border-slate-300 px-1.5 py-2 font-medium">
                  {row.name}
                  {!row.is_graded ? (
                    <span className="ml-1 text-[9px] uppercase text-slate-400">trim</span>
                  ) : null}
                </td>
                <td className="border border-slate-300 px-1.5 py-2 text-center font-semibold tabular-nums">
                  {formatMeasurement(row.base_value, base.unit)}
                </td>
                {/* Handwriting cells — deliberately empty */}
                {Array.from({ length: 7 }).map((_, i) => (
                  <td key={i} className="border border-slate-300 px-1.5 py-2" />
                ))}
                <td className="border border-slate-300 px-1.5 py-2 text-xs text-slate-600">
                  {row.remark ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer */}
        <div className="mt-4 space-y-1 text-sm">
          <p>
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Special instructions:
            </span>{" "}
            {base.special_instructions || "—"}
          </p>
          {base.physical_pattern_kept ? (
            <p>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Physical pattern:
              </span>{" "}
              kept{base.physical_pattern_location ? ` — ${base.physical_pattern_location}` : ""}
            </p>
          ) : null}
          <p className="pt-2 text-[10px] text-slate-400">
            Printed {new Date().toLocaleDateString("en-GB")} · {base.name} · size {size} · {base.id}
          </p>
        </div>
      </div>
    </div>
  );
}
