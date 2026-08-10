import { SewingSessionChangeRequestsPanelClient } from "@/components/dashboard/SewingSessionChangeRequestsPanelClient";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { listPendingSewingSessionChangeRequests } from "@/lib/data/sewing-session-change-requests";
import { summarizeSewingSessionChangeRequest } from "@/lib/production/sewing-session-change-requests";

export async function SewingSessionChangeRequestsPanel() {
  await ensureDocumentsLoaded(["sewing_session_change_requests"]);
  const requests = listPendingSewingSessionChangeRequests().map(
    summarizeSewingSessionChangeRequest
  );

  if (requests.length === 0) {
    return null;
  }

  return <SewingSessionChangeRequestsPanelClient initialRequests={requests} />;
}
