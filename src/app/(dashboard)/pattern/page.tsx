import { PageHeader } from "@/components/ui/PageHeader";
import { PatternWorkList } from "@/components/pattern/PatternWorkList";

export default function PatternPage() {
  return (
    <div>
      <PageHeader
        title="Pattern"
        description="Pattern drafting queue — one job per fabric line. Jobs are created when sales orders are saved."
      />
      <PatternWorkList />
    </div>
  );
}
