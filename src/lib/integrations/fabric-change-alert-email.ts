import { parseAdminEmails } from "@/lib/auth/permissions";
import { sendEmail } from "@/lib/email/smtp";
import type { FabricChangeAlert } from "@/lib/types/fabric-change-alerts";

function formatAlertLine(alert: FabricChangeAlert): string {
  const article =
    alert.article_number != null
      ? `L${String(alert.article_number).padStart(2, "0")}`
      : "line";
  const lines = [
    `- ${alert.so_number} - ${article} - ${alert.fabric_number ?? "n/a"}`,
    `  ${alert.summary}`,
    `  Client: ${alert.client_name} (${alert.client_code})`,
    `  Changed by: ${alert.created_by}`,
    `  Kind: ${alert.kind}`,
  ];
  if (alert.had_a4_printed || alert.had_prep_stickers || alert.had_prod_stickers) {
    lines.push("  Print evidence: already printed - reprint A4 and stickers if needed.");
  }
  if (alert.had_fabric_pos) {
    lines.push("  Fabric POs already created for this order.");
  }
  if (alert.had_pattern_work) {
    lines.push("  Active pattern work exists for this line/order.");
  }
  return lines.join("\n");
}

export async function notifyAdminsOfFabricChange(
  alert: FabricChangeAlert
): Promise<boolean> {
  const recipients = [...parseAdminEmails()];
  if (recipients.length === 0) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  const subject = `ERP: fabric changed on ${alert.so_number} - reprint stickers & A4 if already printed`;

  const text = [
    "Garment ERP - fabric change",
    "",
    "A fabric line changed after POs, pattern work, or printing may already exist.",
    "Reprint stickers and A4 size sheets if they were already printed.",
    "",
    formatAlertLine(alert),
    "",
    `Open order: ${appUrl}/orders/${alert.sales_order_id}`,
    `Client folder: ${appUrl}/clients`,
    `Dashboard: ${appUrl}/dashboard`,
    "",
    "This is an automated message from Garment ERP.",
  ].join("\n");

  try {
    await sendEmail({ to: recipients, subject, text });
    return true;
  } catch (error) {
    console.error("Failed to send fabric change alert email:", error);
    return false;
  }
}
