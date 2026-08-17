import { ClientNameChangeRequestsPanelClient } from "@/components/dashboard/ClientNameChangeRequestsPanelClient";
import { listPendingClientNameChangeRequests } from "@/lib/clients/name-change-requests";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";

export async function ClientNameChangeRequestsPanel() {
  await ensureDocumentsLoaded(["clients"]);
  const requests = listPendingClientNameChangeRequests();

  if (requests.length === 0) {
    return null;
  }

  return <ClientNameChangeRequestsPanelClient initialRequests={requests} />;
}
