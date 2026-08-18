import { signAdminApprovalsToken } from "@/lib/auth/admin-approvals-token";
import {
  ADMIN_DECISION_EMAIL_TOKEN_TTL_MS,
  signAdminDecisionEmailToken,
} from "@/lib/auth/admin-decision-email-token";
import { parseAdminEmails } from "@/lib/auth/permissions";
import { sendEmail } from "@/lib/email/smtp";
import { erpPublicAppUrl } from "@/lib/integrations/erp-app-url";
import type { FabricLineDeleteRequestSummary } from "@/lib/sales-orders/fabric-line-delete-request-list";

function formatRequestBlock(request: FabricLineDeleteRequestSummary): string {
  const lines = [
    `- ${request.so_number} | ${request.article_label} | ${request.fabric_number}`,
    `  Garment: ${request.garment_type}`,
    `  Supplier: ${request.supplier_name} | ${request.quantity} ${request.unit}`,
    `  Client: ${request.client_name} (${request.client_code})`,
    `  Requested by: ${request.delete_requested_by}`,
  ];
  if (request.po_number) {
    lines.push(
      `  Fabric PO: ${request.po_number}${
        request.po_line_emailed ? " (already emailed to supplier)" : " (not emailed yet)"
      }`
    );
  }
  if (request.delete_request_reason) {
    lines.push(`  Reason: ${request.delete_request_reason}`);
  }
  return lines.join("\n");
}

/** Email ADMIN_EMAILS + SUPER_ADMIN_EMAILS when QC/sales request delete of a PO-locked fabric line. */
export async function notifyAdminsOfFabricLineDeleteRequest(
  request: FabricLineDeleteRequestSummary
): Promise<boolean> {
  const recipients = [...parseAdminEmails()];
  if (recipients.length === 0) return false;

  const appUrl = erpPublicAppUrl();
  const subject = `ERP: fabric delete request on ${request.so_number} (${request.fabric_number})`;
  const exp = Date.now() + ADMIN_DECISION_EMAIL_TOKEN_TTL_MS;

  let sent = false;
  for (const recipient of recipients) {
    const link = (action: "approve" | "reject") =>
      `${appUrl}/api/admin-approvals/email-action?token=${signAdminDecisionEmailToken({
        kind: "fabric_line_delete",
        order_id: request.sales_order_id,
        line_id: request.line_id,
        requested_at: request.delete_requested_at,
        action,
        admin_email: recipient,
        exp,
      })}`;

    const text = [
      "Garment ERP - fabric line delete request",
      "",
      "QC/sales asked an admin to remove a fabric line that is locked because it was included in a supplier fabric order.",
      "",
      formatRequestBlock(request),
      "",
      "One click, no login needed (links work for 7 days):",
      "",
      "APPROVE - remove the SO line:",
      link("approve"),
      "",
      "REJECT - keep the line:",
      link("reject"),
      "",
      "ALL pending approvals on one page (approve each or all, no login):",
      `${appUrl}/approvals?token=${signAdminApprovalsToken(recipient, exp)}`,
      "",
      `Open order: ${appUrl}/orders/${request.sales_order_id}`,
      "",
      request.po_line_emailed
        ? "Note: this line was already emailed to the supplier. Approving cancels it in ERP only - contact the supplier if they should not ship."
        : "Note: this line has not been emailed yet; approving cancels it in ERP before send.",
      "",
      "This is an automated message from Garment ERP.",
    ].join("\n");

    try {
      await sendEmail({ to: [recipient], subject, text });
      sent = true;
    } catch (error) {
      console.error(`Failed to send fabric line delete request alert email to ${recipient}:`, error);
    }
  }
  return sent;
}
