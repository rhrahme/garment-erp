import {
  markFabricChangeAlertAcknowledged,
} from "@/lib/data/fabric-change-alerts";
import { notifyIntegration } from "@/lib/integrations";
import type {
  FabricChangeAlert,
  FabricChangeAlertRole,
} from "@/lib/types/fabric-change-alerts";
import { FABRIC_CHANGE_ALERT_ROLES } from "@/lib/types/fabric-change-alerts";

export async function acknowledgeFabricChangeAlert(
  alertId: string,
  role: FabricChangeAlertRole,
  acknowledgedBy: string
): Promise<{ ok: true; alert: FabricChangeAlert } | { ok: false; status: number; error: string }> {
  const trimmedId = alertId.trim();
  if (!trimmedId) {
    return { ok: false, status: 400, error: "alert id is required." };
  }
  if (!FABRIC_CHANGE_ALERT_ROLES.includes(role)) {
    return { ok: false, status: 400, error: "Invalid acknowledgement role." };
  }

  const result = await markFabricChangeAlertAcknowledged(trimmedId, role, acknowledgedBy);
  if (!result) {
    return { ok: false, status: 404, error: "Fabric change alert not found." };
  }

  if (result.newlyAcknowledged) {
    const alert = result.alert;
    await notifyIntegration("sales_order.fabric_change_acknowledged", {
      alert_id: alert.id,
      sales_order_id: alert.sales_order_id,
      so_number: alert.so_number,
      line_id: alert.sales_order_line_id,
      client_id: alert.client_id,
      role,
      acknowledged_at: alert.acknowledgements[role]?.at ?? null,
      acknowledged_by: alert.acknowledgements[role]?.by ?? acknowledgedBy,
      summary: alert.summary,
    });
  }

  return { ok: true, alert: result.alert };
}
