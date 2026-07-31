import { FabricChangeAlertsPanelClient } from "@/components/dashboard/FabricChangeAlertsPanelClient";
import { getSessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import {
  listOutstandingFabricChangeAlertsForClient,
  listOutstandingFabricChangeAlertsForRole,
} from "@/lib/data/fabric-change-alerts";
import {
  canViewFabricChangeAlerts,
  fabricChangeAlertRoleFromSession,
} from "@/lib/sales-orders/fabric-change-alert-role";

type FabricChangeAlertsPanelProps = {
  clientId?: string;
  compact?: boolean;
  title?: string;
};

export async function FabricChangeAlertsPanel({
  clientId,
  compact,
  title,
}: FabricChangeAlertsPanelProps = {}) {
  const session = await getSessionContext();
  if (!canViewFabricChangeAlerts(session)) {
    return null;
  }

  const role = fabricChangeAlertRoleFromSession(session);
  if (!role) return null;

  await ensureDocumentsLoaded(["fabric_change_alerts"]);
  const alerts = clientId
    ? listOutstandingFabricChangeAlertsForClient(clientId, role, 30)
    : listOutstandingFabricChangeAlertsForRole(role, 20);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <FabricChangeAlertsPanelClient
      initialAlerts={alerts}
      role={role}
      compact={compact}
      title={title}
    />
  );
}
