import { parseAdminEmails } from "@/lib/auth/permissions";
import { sendEmail } from "@/lib/email/smtp";
import { summarizeSewingSessionChangeRequest } from "@/lib/production/sewing-session-change-request-summary";
import type { SewingSessionChangeRequest } from "@/lib/types/sewing-session-change-requests";

/** Email ADMIN_EMAILS + SUPER_ADMIN_EMAILS when stitch/pattern request a kiosk change. */
export async function notifyAdminsOfSewingSessionChangeRequest(
  request: SewingSessionChangeRequest
): Promise<boolean> {
  const recipients = [...parseAdminEmails()];
  if (recipients.length === 0) return false;

  const summary = summarizeSewingSessionChangeRequest(request);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  const subject = `ERP: stitch change request (${summary.action})`;

  const text = [
    "Garment ERP - stitch kiosk change request",
    "",
    "Stitch or Pattern asked an admin to change Live/History on the stitch kiosk.",
    "Approve (Confirm) to apply the change, or reject to keep current data.",
    "",
    `- Action: ${summary.action}`,
    `- Label: ${summary.label}`,
    `- Session: ${summary.session_id ?? "-"}`,
    `- Failure: ${summary.failure_id ?? "-"}`,
    `- Production code: ${summary.production_code ?? "-"}`,
    `- Fabric: ${summary.fabric_number ?? "-"}`,
    `- Employee: ${summary.employee_name ?? "-"}`,
    `- SO: ${summary.so_number ?? "-"}`,
    `- Requested by: ${summary.requested_by}`,
    summary.reason ? `- Reason: ${summary.reason}` : null,
    "",
    `Dashboard queue: ${appUrl}/dashboard#sewing-session-change-requests`,
    `Stitch Live/History: ${appUrl}/stitch?tab=live`,
    "",
    "This is an automated message from Garment ERP.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  try {
    await sendEmail({ to: recipients, subject, text });
    return true;
  } catch (error) {
    console.error("Failed to send sewing session change request alert email:", error);
    return false;
  }
}
