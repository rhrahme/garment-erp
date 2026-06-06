import { PageHeader } from "@/components/ui/PageHeader";
import { FabricReceivingWorkspace } from "@/components/fabric-receiving/FabricReceivingWorkspace";

export default function FabricReceivingPage() {
  return (
    <div>
      <PageHeader
        title="Fabric Receiving"
        description="Scan fabric cut stickers at Receive, then Wash or Iron. Work list matches the sales order A4 receiving sheet — QR, fabric cut, composition."
      />
      <FabricReceivingWorkspace />
    </div>
  );
}
