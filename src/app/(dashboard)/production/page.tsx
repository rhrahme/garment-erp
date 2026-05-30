import { PageHeader } from "@/components/ui/PageHeader";
import { ProductionFloorWorkspace } from "@/components/production/ProductionFloorWorkspace";

export default function ProductionPage() {
  return (
    <div>
      <PageHeader
        title="Production"
        description="Manage garment pieces from cutting through sewing, garment wash, finishing, and packing."
      />
      <ProductionFloorWorkspace />
    </div>
  );
}
