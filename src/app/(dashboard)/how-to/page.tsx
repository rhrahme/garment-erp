import { PageHeader } from "@/components/ui/PageHeader";
import { TeamHowToTab } from "@/components/layout/TeamHowToTab";

export default function TeamHowToPage() {
  return (
    <div>
      <PageHeader
        title="How-to"
        description="Step-by-step for every team, English and Bangla. New ones show at the top of every ERP page and are emailed. They stay here after you tap Got it."
      />
      <TeamHowToTab />
    </div>
  );
}
