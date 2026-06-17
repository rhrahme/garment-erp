import { PageHeader } from "@/components/ui/PageHeader";
import { PatternJobDetail } from "@/components/pattern/PatternJobDetail";

export default async function PatternJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  return (
    <div>
      <PageHeader title="Pattern job" description="Drafting, fittings, revisions, and file uploads." />
      <PatternJobDetail jobId={jobId} />
    </div>
  );
}
