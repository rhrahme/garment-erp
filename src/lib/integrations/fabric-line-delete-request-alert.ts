import { parseAdminEmails } from "@/lib/auth/permissions";
import { sendEmail } from "@/lib/email/smtp";
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  const subject = `ERP: fabric delete request on ${request.so_number} (${request.fabric_number})`;

  const text = [
    "Garment ERP - fabric line delete request",
    "",
    "QC/sales asked an admin to remove a fabric line that is locked because it was included in a supplier fabric order.",
    "Approve (OK) to remove the SO line and cancel the PO linkage, or reject (Not) to keep it.",
    "",
    formatRequestBlock(request),
    "",
    `Open order (approve/reject): ${appUrl}/orders/${request.sales_order_id}`,
    `Dashboard queue: ${appUrl}/dashboard#fabric-line-delete-requests`,
    "",
    request.po_line_emailed
      ? "Note: this line was already emailed to the supplier. Approving cancels it in ERP only - contact the supplier if they should not ship."
      : "Note: this line has not been emailed yet; approving cancels it in ERP before send.",
    "",
    "This is an automated message from Garment ERP.",
  ].join("\n");

  try {
    await sendEmail({ to: recipients, subject, text });
    return true;
  } catch (error) {
    console.error("Failed to send fabric line delete request alert email:", error);
    return false;
  }
}
