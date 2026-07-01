import { PageHeader } from "@/components/ui/PageHeader";
import { FabricReceivingWorkspace } from "@/components/fabric-receiving/FabricReceivingWorkspace";

export default function FabricReceivingPage() {
  return (
    <div>
      <PageHeader
        title="Fabric Receiving"
        description="Paste or type the unique fabric sticker code to look up the line and mark it received. Use the floor scanner below only for wash, soak, and iron prep."
      />
      <FabricReceivingWorkspace />
    </div>
  );
}
