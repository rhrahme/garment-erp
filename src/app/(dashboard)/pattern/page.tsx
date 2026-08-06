import Link from "next/link";
import { ArrowRight, LibraryBig } from "lucide-react";
import { FabricChangeAlertsPanel } from "@/components/dashboard/FabricChangeAlertsPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { PatternAlterationPendingPanel } from "@/components/pattern/PatternAlterationPendingPanel";
import { PatternQueueSection } from "@/components/pattern/PatternQueueSection";
import { PatternStageScanPanel } from "@/components/pattern/PatternStageScanPanel";

export default function PatternPage() {
  return (
    <div>
      <PageHeader
        title="Pattern"
        description="Pattern drafting queue grouped by client + sales order. Open an order to work fabric lines and link shared master patterns."
      />
      <PatternAlterationPendingPanel />
      <FabricChangeAlertsPanel />
      <div className="mb-4">
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
      </div>
      <div className="mb-6">
        <PatternStageScanPanel />
      </div>
      <PatternQueueSection />
    </div>
  );
}
