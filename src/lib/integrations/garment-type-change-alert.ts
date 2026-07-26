import { parseAdminEmails } from "@/lib/auth/permissions";
import { sendEmail } from "@/lib/email/smtp";
import type { GarmentTypeChange } from "@/lib/types/garment-type-changes";

function formatChangeLine(change: GarmentTypeChange): string {
  const article = `L${String(change.article_number).padStart(2, "0")}`;
  const lines = [
    `- ${change.so_number} · ${article} · ${change.fabric_number}`,
    `  ${change.from_garment_type} → ${change.to_garment_type}`,
    `  Client: ${change.client_name} (${change.client_code})`,
    `  Changed by: ${change.changed_by}`,
  ];
  if (change.note) lines.push(`  Note: ${change.note}`);
  return lines.join("\n");
}

export async function notifyAdminsOfGarmentTypeChange(
  change: GarmentTypeChange
): Promise<boolean> {
  const recipients = [...parseAdminEmails()];
  if (recipients.length === 0) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  const subject = `ERP: garment type changed on ${change.so_number} (${change.from_garment_type} → ${change.to_garment_type})`;

  const text = [
    "Garment ERP — garment type change",
    "",
    "An operator changed the stitch / garment type on a sales order fabric line.",
    "Review the history on the admin dashboard and reprint labels if stickers were already printed.",
    "",
    formatChangeLine(change),
    "",
    `Open order: ${appUrl}/orders/${change.sales_order_id}`,
    `Dashboard history: ${appUrl}/dashboard`,
    "",
    "This is an automated message from Garment ERP.",
  ].join("\n");

  try {
    await sendEmail({ to: recipients, subject, text });
    return true;
  } catch (error) {
    console.error("Failed to send garment type change alert email:", error);
    return false;
  }
}
