"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function SalesOrderPrintToolbar({
  orderId,
  soNumber,
  team = "full",
}: {
  orderId: string;
  soNumber: string;
  team?: "full" | "receiving" | "production";
}) {
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
          <p className="text-xs text-slate-500">Print dialog → Save as PDF</p>
          <Button onClick={() => window.print()}>
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
