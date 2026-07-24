"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { formatMeasurement, unitLabel } from "@/lib/pattern-library/measurements";
import type { BasePattern } from "@/lib/types/pattern-library";

const SHEET_PRINT_CSS = `
@page { size: A4 landscape; margin: 10mm; }
@media print {
  .no-print { display: none !important; }
  .pattern-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; }
  .pattern-sheet tr { page-break-inside: avoid; }
}
`;

/** Printable A4 base-pattern size grid (landscape — wide size runs). */
export function BasePatternPrintView({ base }: { base: BasePattern }) {
  const gradedPoints = base.points.filter((point) => point.is_graded);
  const trimPoints = base.points.filter((point) => !point.is_graded);

  return (
    <div className="mx-auto min-h-screen max-w-[297mm] bg-white p-6 text-slate-900 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: SHEET_PRINT_CSS }} />

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <Link
          href={`/pattern/library/bases/${base.id}`}
          className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
        >
          ← Back to {base.name}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      <div className="pattern-sheet rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">BASE PATTERN — SIZE GRID</h1>
            <p className="mt-1 text-sm font-semibold">
              {base.name} · {unitLabel(base.unit)}
              {base.style_code ? ` · Style ${base.style_code}` : ""}
              {base.season ? ` · ${base.season}` : ""}
            </p>
          </div>
          <div className="rounded-lg border-2 border-slate-900 px-4 py-2 text-center">
            <p className="text-2xl font-black tracking-widest">{base.house_brand_code}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">House brand</p>
          </div>
        </div>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-900 text-left text-xs font-bold uppercase tracking-wide">
              <th className="py-1.5 pr-2">Measurement point</th>
              {base.sizes.map((size) => (
                <th key={size} className="px-1.5 py-1.5 text-center">
                  {size}
                </th>
              ))}
              <th className="py-1.5 pl-2">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {gradedPoints.map((point) => (
              <tr key={point.point_id} className="border-b border-slate-300">
                <td className="whitespace-nowrap py-1.5 pr-2 font-medium">{point.name}</td>
                {base.sizes.map((size) => (
                  <td key={size} className="px-1.5 py-1.5 text-center tabular-nums">
                    {formatMeasurement(point.values[size] ?? null, base.unit)}
                  </td>
                ))}
                <td className="py-1.5 pl-2 text-xs">{point.remark ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {trimPoints.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Trims (constant across sizes)
            </p>
            <div className="mt-1 grid grid-cols-2 gap-x-8 gap-y-0.5 text-sm sm:grid-cols-3">
              {trimPoints.map((point) => {
                const value = Object.values(point.values).find((v) => v !== null) ?? null;
                return (
                  <p key={point.point_id}>
                    <span className="text-slate-600">{point.name}:</span>{" "}
                    <span className="font-semibold tabular-nums">
                      {formatMeasurement(value, base.unit)}
                    </span>
                    {point.remark ? (
                      <span className="text-xs text-slate-500"> — {point.remark}</span>
                    ) : null}
                  </p>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-1 text-sm">
          <p>
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Special instructions:
            </span>{" "}
            {base.special_instructions || "—"}
          </p>
          {base.notes ? (
            <p>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Notes:</span>{" "}
              {base.notes}
            </p>
          ) : null}
          <p className="pt-2 text-[10px] text-slate-400">
            Printed {new Date().toLocaleDateString("en-GB")} · {base.id}
          </p>
        </div>
      </div>
    </div>
  );
}
