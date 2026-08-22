"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { PATTERN_HOWTO_A4_PRINT_CSS } from "@/lib/pattern/pattern-howto-print-styles";
import type { PatternHowToDefinition } from "@/lib/pattern/pattern-operator-notice-copy";

type PatternHowToPrintViewProps = {
  items: PatternHowToDefinition[];
};

export function PatternHowToPrintView({ items }: PatternHowToPrintViewProps) {
  return (
    <div className="pattern-howto-print min-h-screen bg-white p-4 text-slate-900 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: PATTERN_HOWTO_A4_PRINT_CSS }} />

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <Link href="/pattern/how-to" className="text-sm font-medium text-indigo-700">
            Back to How-to
          </Link>
          <p className="mt-1 text-xs text-slate-600">
            Print A4 portrait, Actual size. Keep this paper at the Pattern desk.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
        >
          <Printer className="h-4 w-4" />
          Print how-to
        </button>
      </div>

      <div className="print-a4-sheet bg-white">
        <p className="howto-print-kicker mb-3 text-slate-600">
          Garment ERP - Pattern how-to. Follow these steps. Do not wait for the owner.
        </p>
        {items.map((item, index) => (
          <section key={item.id} className={index > 0 ? "mt-6 border-t border-slate-300 pt-4" : ""}>
            <h1 className="howto-print-title font-semibold text-slate-900">{item.title}</h1>
            <pre className="howto-print-body mt-2 font-sans text-slate-800">{item.body}</pre>
          </section>
        ))}
      </div>
    </div>
  );
}
