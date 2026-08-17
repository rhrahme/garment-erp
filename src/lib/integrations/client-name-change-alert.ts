import { parseAdminEmails } from "@/lib/auth/permissions";
import { signAdminApprovalsToken } from "@/lib/auth/admin-approvals-token";
import {
  NAME_CHANGE_EMAIL_TOKEN_TTL_MS,
  signNameChangeEmailToken,
} from "@/lib/clients/name-change-email-token";
import { sendEmail } from "@/lib/email/smtp";
import type { ClientNameChangeRequestSummary } from "@/lib/clients/name-change-requests";

/**
 * Email ADMIN_EMAILS + SUPER_ADMIN_EMAILS when QC/non-admins request a client
 * rename. Each admin gets their own signed one-click Approve/Reject links so
 * they can act straight from the email (phone inbox) without logging in.
 */
export async function notifyAdminsOfClientNameChangeRequest(
  request: ClientNameChangeRequestSummary
): Promise<boolean> {
  const recipients = [...parseAdminEmails()];
  if (recipients.length === 0) return false;

  // Fall back to the production host (never localhost) - these links are
  // clicked from phone inboxes and must work outside the dev machine.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://erp.hagan.pro").replace(
    /\/$/,
    ""
  );
  const subject = `ERP: client name change request (${request.client_code})`;
  const exp = Date.now() + NAME_CHANGE_EMAIL_TOKEN_TTL_MS;

  let sent = false;
  for (const recipient of recipients) {
    const link = (action: "approve" | "reject") =>
      `${appUrl}/api/clients/name-change-email-action?token=${signNameChangeEmailToken({
        client_id: request.client_id,
        action,
        requested_at: request.requested_at,
        admin_email: recipient,
        exp,
      })}`;

    const text = [
      "Garment ERP - client name change request",
      "",
      "A non-admin asked to rename an existing client.",
      "",
      `- Client: ${request.current_name} (${request.client_code})`,
      `  Proposed name: ${request.proposed_name}`,
      `  Requested by: ${request.requested_by}`,
      "",
      "One click, no login needed (links work for 7 days):",
      "",
      `APPROVE - apply the new name:`,
      link("approve"),
      "",
      `REJECT - keep the current name:`,
      link("reject"),
      "",
      "ALL pending approvals on one page (approve each or all, no login):",
      `${appUrl}/approvals?token=${signAdminApprovalsToken(recipient, exp)}`,
      "",
      `Or handle it on the dashboard: ${appUrl}/dashboard#client-name-change-requests`,
      "",
      "This is an automated message from Garment ERP.",
    ].join("\n");

    try {
      await sendEmail({ to: [recipient], subject, text });
      sent = true;
    } catch (error) {
      console.error(
        `Failed to send client name change request alert email to ${recipient}:`,
        error
      );
    }
  }
  return sent;
}
