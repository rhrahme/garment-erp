import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PatternOrderBoard } from "@/components/pattern/PatternOrderBoard";

export default async function PatternOrderPage({ params }: { params: Promise<{ soId: string }> }) {
  const { soId } = await params;

  return (
    <div>
      <PageHeader
        title="Pattern order board"
        description="Select fabrics that share one pattern, consolidate, then upload the .TUD and fill sizes."
      />
      <Suspense fallback={<p className="text-sm text-slate-500">Loading order board…</p>}>
        <PatternOrderBoard soId={soId} />
      </Suspense>
    </div>
  );
}
