"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import {
  PATTERN_SHEET_PRINT_CSS,
  PatternSheetPrintView,
} from "@/components/pattern/library/PatternSheetPrintView";
import {
  patternSheetKindLabel,
  type PatternSheetKind,
} from "@/lib/pattern-library/pattern-sheet-kind";
import type { PatternSheetData } from "@/lib/pattern-library/sheet-data";

export type PatternOrderBatchSheet = {
  jobId: string;
  articleLabel: string;
  fabricNumber: string;
  data: PatternSheetData;
};

export function PatternOrderBatchPrintView({
  soId,
  soNumber,
  clientName,
  kind,
  sheets,
  skipped,
}: {
  soId: string;
  soNumber: string;
  clientName: string;
  kind: PatternSheetKind;
  sheets: PatternOrderBatchSheet[];
  skipped: Array<{ articleLabel: string; reason: string }>;
}) {
  const kindLabel = patternSheetKindLabel(kind);

  return (
    <div className="pattern-batch-root min-h-screen bg-white p-6 text-slate-900 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: PATTERN_SHEET_PRINT_CSS }} />

      <div className="no-print mb-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href={`/pattern/orders/${soId}`}
              className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
            >
              Back to {clientName} - {soNumber}
            </Link>
            <p className="mt-1 text-xs text-slate-500">
              Batch {kindLabel} A4 - {sheets.length} fabric
              {sheets.length === 1 ? "" : "s"} selected
              {kind === "production" || kind === "sewing"
                ? " - multi-piece garments split per stitcher piece"
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={sheets.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Print all selected
          </button>
        </div>
        {sheets.length > 0 ? (
          <ul className="flex flex-wrap gap-2 text-xs text-slate-600">
            {sheets.map((sheet) => (
              <li
                key={sheet.jobId}
                className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200"
              >
                {sheet.articleLabel} - {sheet.fabricNumber}
              </li>
            ))}
          </ul>
        ) : null}
        {skipped.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <p className="font-medium">Skipped {skipped.length} selection(s)</p>
            <ul className="mt-1 list-disc pl-4">
              {skipped.map((row) => (
                <li key={`${row.articleLabel}-${row.reason}`}>
                  {row.articleLabel}: {row.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {sheets.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Nothing to print. Link a master pattern on each selected fabric job first.
        </p>
      ) : (
        <div className="space-y-8 print:space-y-0">
          {sheets.map((sheet) => (
            <PatternSheetPrintView
              key={sheet.jobId}
              data={sheet.data}
              kind={kind}
              embedded
            />
          ))}
        </div>
      )}
    </div>
  );
}
