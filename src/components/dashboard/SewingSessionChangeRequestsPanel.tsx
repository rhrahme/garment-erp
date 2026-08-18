import { SewingSessionChangeRequestsPanelClient } from "@/components/dashboard/SewingSessionChangeRequestsPanelClient";
import {
  listPendingSewingSessionChangeRequests,
  readSewingSessionChangeRequestsFresh,
} from "@/lib/data/sewing-session-change-requests";
import { summarizeSewingSessionChangeRequest } from "@/lib/production/sewing-session-change-requests";

export async function SewingSessionChangeRequestsPanel() {
  const store = await readSewingSessionChangeRequestsFresh();
  const requests = listPendingSewingSessionChangeRequests(store).map(
    summarizeSewingSessionChangeRequest
  );

  if (requests.length === 0) {
    return null;
  }

  return <SewingSessionChangeRequestsPanelClient initialRequests={requests} />;
}
