import Link from "next/link";
import { ArrowRight, LibraryBig } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PatternWorkList } from "@/components/pattern/PatternWorkList";
import { WashedReadyPanel } from "@/components/pattern/library/WashedReadyPanel";

export default function PatternPage() {
  return (
    <div>
      <PageHeader
        title="Pattern"
        description="Pattern drafting queue — one job per fabric line. Jobs are created when sales orders are saved."
      />
      <div className="mb-4 space-y-3">
        <Link
          href="/pattern/library"
          className="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 transition-colors hover:bg-indigo-50"
        >
          <div className="flex items-center gap-3">
            <LibraryBig className="h-5 w-5 text-indigo-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Pattern Library</p>
              <p className="text-xs text-slate-600">
                Base patterns per house brand &amp; cut family · client patterns with trials
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-indigo-600" />
        </Link>
        <WashedReadyPanel />
      </div>
      <PatternWorkList />
    </div>
  );
}
