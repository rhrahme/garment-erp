import { PageHeader } from "@/components/ui/PageHeader";
import { PatternHowToTab } from "@/components/pattern/PatternHowToTab";

export default function PatternHowToPage() {
  return (
    <div>
      <PageHeader
        title="How-to"
        description="Step-by-step explanations for Pattern. New ones show at the top of every Pattern page and are emailed. They stay here after you tap Got it."
      />
      <PatternHowToTab />
    </div>
  );
}
