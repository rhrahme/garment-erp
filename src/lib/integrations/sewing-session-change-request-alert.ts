import { signAdminApprovalsToken } from "@/lib/auth/admin-approvals-token";
import {
  ADMIN_DECISION_EMAIL_TOKEN_TTL_MS,
  signAdminDecisionEmailToken,
} from "@/lib/auth/admin-decision-email-token";
import { parseAdminEmails } from "@/lib/auth/permissions";
import { sendEmail } from "@/lib/email/smtp";
import { erpPublicAppUrl } from "@/lib/integrations/erp-app-url";
import { summarizeSewingSessionChangeRequest } from "@/lib/production/sewing-session-change-request-summary";
import type { SewingSessionChangeRequest } from "@/lib/types/sewing-session-change-requests";

/** Email ADMIN_EMAILS + SUPER_ADMIN_EMAILS when stitch/pattern request a kiosk change. */
export async function notifyAdminsOfSewingSessionChangeRequest(
  request: SewingSessionChangeRequest
): Promise<boolean> {
  const recipients = [...parseAdminEmails()];
  if (recipients.length === 0) return false;

  const summary = summarizeSewingSessionChangeRequest(request);
  const appUrl = erpPublicAppUrl();
  const overtime = request.action === "overtime_confirm";
  const startedWithoutQr = request.action === "started_without_qr";
  const subject = startedWithoutQr
    ? `ERP: started without QR (${summary.production_code ?? summary.session_id ?? "session"})`
    : overtime
    ? `ERP: overtime scan to confirm (${summary.production_code ?? summary.session_id ?? "session"})`
    : `ERP: stitch kiosk request (${summary.action})`;
  const exp = Date.now() + ADMIN_DECISION_EMAIL_TOKEN_TTL_MS;

  let sent = false;
  for (const recipient of recipients) {
    const link = (action: "approve" | "reject") =>
      `${appUrl}/api/admin-approvals/email-action?token=${signAdminDecisionEmailToken({
        kind: "sewing_session",
        request_id: request.id,
        requested_at: request.requested_at,
        action,
        admin_email: recipient,
        exp,
      })}`;

    const text = [
      startedWithoutQr
        ? "Garment ERP - stitcher started without a printed QR"
        : overtime
          ? "Garment ERP - overtime scan logged after 22:00 Riyadh"
          : "Garment ERP - stitch kiosk request",
      "",
      startedWithoutQr
        ? "The session is already running with the start time they entered. Confirm acknowledges that time. Reject does not stop the work."
        : overtime
          ? "The scan is already logged. Confirm it so Performance counts it, or Reject to keep the log but drop the hours."
          : "The stitch kiosk asked an admin to change Live/History.",
      "",
      `- Action: ${summary.action}`,
      `- Label: ${summary.label}`,
      `- Session: ${summary.session_id ?? "-"}`,
      `- Failure: ${summary.failure_id ?? "-"}`,
      `- Production code: ${summary.production_code ?? "-"}`,
      `- Fabric: ${summary.fabric_number ?? "-"}`,
      `- Garment: ${summary.garment_type ?? "-"}`,
      `- Client: ${summary.client_label ?? summary.client_name ?? "-"}`,
      `- Employee: ${summary.employee_name ?? "-"}`,
      `- SO: ${summary.so_number ?? "-"}`,
      `- Started at: ${summary.started_at ?? "-"}`,
      `- Requested by: ${summary.requested_by}`,
      summary.reason ? `- Reason: ${summary.reason}` : null,
      "",
      "One click, no login needed (links work for 7 days):",
      "",
      startedWithoutQr
        ? "CONFIRM - acknowledge the start time (session already running):"
        : overtime
          ? "CONFIRM - overtime counts:"
          : "APPROVE - apply the change:",
      link("approve"),
      "",
      startedWithoutQr
        ? "REJECT - keep the session running:"
        : overtime
          ? "REJECT - keep the log, drop Performance hours:"
          : "REJECT - keep current data:",
      link("reject"),
      "",
      "ALL pending approvals on one page (approve each or all, no login):",
      `${appUrl}/approvals?token=${signAdminApprovalsToken(recipient, exp)}`,
      "",
      `Dashboard queue: ${appUrl}/dashboard#sewing-session-change-requests`,
      "",
      "This is an automated message from Garment ERP.",
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    try {
      await sendEmail({ to: [recipient], subject, text });
      sent = true;
    } catch (error) {
      console.error(
        `Failed to send sewing session change request alert email to ${recipient}:`,
        error
      );
    }
  }
  return sent;
}
