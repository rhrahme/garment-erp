import { PageHeader } from "@/components/ui/PageHeader";
import { FabricReceivingWorkspace } from "@/components/fabric-receiving/FabricReceivingWorkspace";

export default function FabricReceivingPage() {
  return (
    <div>
      <PageHeader
        title="Fabric Receiving"
        description="Receive fabric as one cut per order line, prepare it, then hand off — multi-piece garments like suits split into separate production pieces."
      />
      <FabricReceivingWorkspace />
    </div>
  );
}
