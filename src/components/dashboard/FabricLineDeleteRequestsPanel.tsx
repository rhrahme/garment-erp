import { FabricLineDeleteRequestsPanelClient } from "@/components/dashboard/FabricLineDeleteRequestsPanelClient";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { ensureFabricOrdersLoaded } from "@/lib/integrations/fabric-order-store";
import { listPendingFabricLineDeleteRequests } from "@/lib/sales-orders/fabric-line-delete-requests";

export async function FabricLineDeleteRequestsPanel() {
  await ensureDocumentsLoaded(["sales_orders", "fabric_orders"]);
  await ensureFabricOrdersLoaded();
  const requests = listPendingFabricLineDeleteRequests();

  if (requests.length === 0) {
    return null;
  }

  return <FabricLineDeleteRequestsPanelClient initialRequests={requests} />;
}
