import { PageHeader } from "@/components/ui/PageHeader";
import { FabricReceivingWorkspace } from "@/components/fabric-receiving/FabricReceivingWorkspace";

export default function FabricReceivingPage() {
  return (
    <div>
      <PageHeader
        title="Fabric Receiving"
        description="Scan fabric cut stickers at Receive, then Wash or Iron. Click the green scan box first on Windows — USB scanners type like a keyboard. Work list shows QR, fabric cut, composition."
      />
      <FabricReceivingWorkspace />
    </div>
  );
}
