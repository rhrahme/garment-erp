"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useMarkFabricLinesPrinted } from "@/components/orders/useMarkFabricLinesPrinted";

export function PrintPackToolbar({
  orderId,
  soNumber,
  a4LineIds,
}: {
  orderId: string;
  soNumber: string;
  a4LineIds: string[];
}) {
  const { printWithMark } = useMarkFabricLinesPrinted(orderId);
  const hasUnprinted = a4LineIds.length > 0;

  return (
    <div className="no-print mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <Link href={`/orders/${orderId}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
        {soNumber}
      </Link>
      <p className="text-xs text-slate-500">
        {hasUnprinted
          ? `Print receiving A4 for ${a4LineIds.length} new line${a4LineIds.length === 1 ? "" : "s"}, then sticker rolls below`
          : "All lines printed on receiving A4 — sticker rolls below cover any new lines only"}
      </p>
      <Button
        onClick={() => printWithMark([{ kind: "a4", lineIds: a4LineIds }])}
        disabled={!hasUnprinted}
      >
        <Printer className="h-4 w-4" />
        Print receiving A4
      </Button>
    </div>
  );
}
