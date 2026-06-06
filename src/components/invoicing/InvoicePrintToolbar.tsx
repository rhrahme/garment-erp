"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function InvoicePrintToolbar({ invoiceNumber }: { invoiceNumber: string }) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <Link href="/invoices" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
        ← All invoices
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-slate-500">{invoiceNumber} · Print dialog → Save as PDF</p>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print / PDF
        </Button>
      </div>
    </div>
  );
}
