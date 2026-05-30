import { parseSuperAdminEmails } from "@/lib/auth/permissions";
import { sendEmail } from "@/lib/email/smtp";
import {
  markAvailabilityAlertsEmailed,
  type SupplierAvailabilityAlert,
} from "@/lib/integrations/supplier-availability-store";

function statusLabel(status: SupplierAvailabilityAlert["status"]): string {
  switch (status) {
    case "temp_unavailable":
      return "Temporarily unavailable";
    case "permanently_unavailable":
      return "Out of stock / no longer available";
    case "substituted":
      return "Substitution suggested";
    default:
      return status;
  }
}

function formatAlertLine(alert: SupplierAvailabilityAlert): string {
  const parts = [
    `- ${alert.fabric_number} (${alert.supplier_name ?? alert.supplier_id ?? "Supplier"}) — ${statusLabel(alert.status)}`,
  ];
  if (alert.restock_date) parts.push(`  Available from: ${alert.restock_date}`);
  if (alert.substitute_fabric_number) parts.push(`  Suggested replacement: ${alert.substitute_fabric_number}`);
  if (alert.client_name) parts.push(`  Client: ${alert.client_name}`);
  if (alert.sales_order_number) parts.push(`  Sales order: ${alert.sales_order_number}`);
  if (alert.po_number) parts.push(`  Fabric PO: ${alert.po_number}`);
  if (alert.note) parts.push(`  Supplier note: ${alert.note}`);
  return parts.join("\n");
}

export async function notifyAdminsOfAvailabilityAlerts(
  alerts: SupplierAvailabilityAlert[]
): Promise<boolean> {
  const pending = alerts.filter((alert) => !alert.alert_emailed_at);
  if (pending.length === 0) return false;

  const recipients = [...parseSuperAdminEmails()];
  if (recipients.length === 0) return false;

  const subject =
    pending.length === 1
      ? `ERP alert: fabric ${pending[0].fabric_number} unavailable (${pending[0].supplier_name ?? "supplier"})`
      : `ERP alert: ${pending.length} fabrics unavailable from suppliers`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

  const text = [
    "Garment ERP — supplier fabric availability alert",
    "",
    "A supplier reply indicates one or more ordered fabrics are not fully available.",
    "Review in Supplier Inbox and choose to wait for restock or replace the fabric on the sales order.",
    "",
    ...pending.map(formatAlertLine),
    "",
    `Open Supplier Inbox: ${appUrl}/supplier-inbox`,
    "",
    "This is an automated message from Garment ERP.",
  ].join("\n");

  try {
    await sendEmail({ to: recipients, subject, text });
    markAvailabilityAlertsEmailed(pending.map((alert) => alert.id));
    return true;
  } catch (error) {
    console.error("Failed to send availability alert email:", error);
    return false;
  }
}
