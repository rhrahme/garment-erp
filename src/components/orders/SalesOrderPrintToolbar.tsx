"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { FabricLinePrintKind } from "@/lib/sales-orders/fabric-lines";
import { PRINTING_FREE } from "@/lib/sales-orders/print-mode";
import { useMarkFabricLinesPrinted } from "@/components/orders/useMarkFabricLinesPrinted";


export function SalesOrderPrintToolbar({
  orderId,
  soNumber,
  team = "full",
  printKind,
  printLineIds = [],
  sheetLineCount,
}: {
  orderId: string;
  soNumber: string;
  team?: "full" | "receiving" | "production";
  printKind?: FabricLinePrintKind;
  /** Unprinted line ids only — passed to mark-print API after print. */
  printLineIds?: string[];
  /** Receiving A4: enable print when full sheet has lines even if all already marked. */
  sheetLineCount?: number;
}) {
  const { printWithMark } = useMarkFabricLinesPrinted(orderId);
  const lineCount = printLineIds.length;
  const hasLines = lineCount > 0;
  const canPrintReceivingA4 =
    printKind === "a4" && (PRINTING_FREE ? (sheetLineCount ?? 0) > 0 : lineCount > 0);
  const canPrintProduction = printKind === "prod_stickers" && hasLines;
  const canPrintSheet =
    team === "full" || canPrintReceivingA4 || canPrintProduction || (PRINTING_FREE && Boolean(printKind) && hasLines);

  const printHint =
    PRINTING_FREE && printKind && hasLines
      ? `Testing mode — ${lineCount} line${lineCount === 1 ? "" : "s"}, reprint anytime`
      : team === "receiving" && canPrintReceivingA4
        ? PRINTING_FREE
          ? `Full order sheet (${sheetLineCount} lines)`
          : `${lineCount} new line${lineCount === 1 ? "" : "s"} to print`
        : canPrintProduction
          ? `Print dialog covers ${lineCount} line${lineCount === 1 ? "" : "s"}`
          : team === "full"
            ? "Print dialog → Save as PDF (full order summary)"
            : "No fabric lines on this sheet";

  const printLinks = [
    { id: "receiving" as const, label: "Receiving / wash (A4)" },
    { id: "production" as const, label: "Production pieces (A4)" },
    { id: "full" as const, label: "Full order (A4)" },
  ];

  return (
    <div className="no-print mb-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/orders/${orderId}`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          {soNumber}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-slate-500">{printHint}</p>
          <Button
            onClick={() =>
              printKind
                ? printWithMark([{ kind: printKind, lineIds: printLineIds }])
                : window.print()
            }
            disabled={!canPrintSheet}
          >
            <Printer className="h-4 w-4" />
            Print this sheet
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {printLinks.map((link) => (
          <Link
            key={link.id}
            href={`/orders/${orderId}/print?team=${link.id}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              team === link.id
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
