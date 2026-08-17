import Link from "next/link";
import { FileText, Printer } from "lucide-react";
import {
  SUITS_YOUNG,
  SUITS_YOUNG_SUBTITLE,
  SUITS_YOUNG_TITLE,
} from "@/lib/marketing/suits-young";

export const dynamic = "force-dynamic";

/** Marketing documents: curated lookbooks and client-facing material. */
export default function MarketingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Marketing</h1>
        <p className="mt-1 text-sm text-slate-500">
          Client-facing lookbooks and style proposals, print-ready on A4.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-base font-semibold text-slate-800">
              <FileText className="h-4 w-4 text-indigo-500" />
              {SUITS_YOUNG_TITLE}
            </p>
            <p className="mt-1 text-sm text-slate-500">{SUITS_YOUNG_SUBTITLE}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUITS_YOUNG.map((suit) => (
                <span
                  key={suit.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600"
                >
                  <span
                    className="h-3 w-3 rounded-full border border-black/10"
                    style={{ background: suit.suit.color }}
                  />
                  {suit.order_label}: {suit.color_name} - {suit.fabric.supplier}{" "}
                  {suit.fabric.article}
                </span>
              ))}
            </div>
          </div>
          <Link
            href="/marketing/suits-young"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Printer className="h-4 w-4" />
            Open / Print
          </Link>
        </div>
      </div>
    </div>
  );
}
