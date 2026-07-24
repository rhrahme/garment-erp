import { PageHeader } from "@/components/ui/PageHeader";
import { ProductionFloorWorkspace } from "@/components/production/ProductionFloorWorkspace";

export default function ProductionPage() {
  return (
    <div>
      <PageHeader
        title="Factory floor"
        description="Wash → iron (Fabric Receiving) · cut → finish → hand to delivery driver. Scan or advance stages by client."
      />
      <ProductionFloorWorkspace />
    </div>
  );
}
