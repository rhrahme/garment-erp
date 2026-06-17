import { PageHeader } from "@/components/ui/PageHeader";
import { PatternOrderBoard } from "@/components/pattern/PatternOrderBoard";

export default async function PatternOrderPage({ params }: { params: Promise<{ soId: string }> }) {
  const { soId } = await params;

  return (
    <div>
      <PageHeader title="Pattern order board" description="All fabric lines for this sales order — specs only, no prices." />
      <PatternOrderBoard soId={soId} />
    </div>
  );
}
