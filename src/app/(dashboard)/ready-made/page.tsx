import { ReadyMadeWorkspace } from "@/components/ready-made/ReadyMadeWorkspace";
import { getReadyMadeOverview } from "@/lib/ready-made/summary";

export default function ReadyMadePage() {
  const overview = getReadyMadeOverview();
  return <ReadyMadeWorkspace overview={overview} />;
}
