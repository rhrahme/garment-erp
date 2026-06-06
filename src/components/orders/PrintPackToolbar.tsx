"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function PrintPackToolbar({ orderId, soNumber }: { orderId: string; soNumber: string }) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <Link href={`/orders/${orderId}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
        {soNumber}
      </Link>
      <p className="text-xs text-slate-500">Print receiving A4 first, then sticker rolls below</p>
      <Button onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        Print receiving A4
      </Button>
    </div>
  );
}
