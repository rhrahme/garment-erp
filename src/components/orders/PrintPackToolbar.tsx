"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useMarkFabricLinesPrinted } from "@/components/orders/useMarkFabricLinesPrinted";
import { PRINTING_FREE } from "@/lib/sales-orders/print-mode";

export function PrintPackToolbar({
  orderId,
  soNumber,
  a4LineIds,
  a4SheetLineCount,
}: {
  orderId: string;
  soNumber: string;
  /** Unprinted line ids only — passed to mark-print API after print. */
  a4LineIds: string[];
  a4SheetLineCount: number;
}) {
  const { printWithMark } = useMarkFabricLinesPrinted(orderId);
  const canPrintA4 = PRINTING_FREE ? a4SheetLineCount > 0 : a4LineIds.length > 0;

  return (
    <div className="no-print mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <Link href={`/orders/${orderId}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
        {soNumber}
      </Link>
      <p className="text-xs text-slate-500">
        {canPrintA4
          ? PRINTING_FREE
            ? `Full receiving A4 (${a4SheetLineCount} lines) — testing: reprint anytime, then sticker rolls below`
            : `Receiving A4 (${a4LineIds.length} new line${a4LineIds.length === 1 ? "" : "s"}) — then sticker rolls below`
          : a4SheetLineCount > 0
            ? "All fabric lines already printed on A4 — add a new article or print sticker rolls below"
            : "No fabric lines on this order"}
      </p>
      <Button
        onClick={() => printWithMark([{ kind: "a4", lineIds: a4LineIds }])}
        disabled={!canPrintA4}
      >
        <Printer className="h-4 w-4" />
        Print receiving A4
      </Button>
    </div>
  );
}
