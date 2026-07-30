import { parseAdminEmails } from "@/lib/auth/permissions";
import { sendEmail } from "@/lib/email/smtp";
import type { ThreadButtonMatchRecord, ThreadButtonPhoto } from "@/lib/types/thread-button-matching";

function formatArticle(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

export async function notifyAdminsOfThreadButtonPhotoUpload(
  match: ThreadButtonMatchRecord,
  photo: ThreadButtonPhoto
): Promise<boolean> {
  const recipients = [...parseAdminEmails()];
  if (recipients.length === 0) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  const article = formatArticle(match.article_number);
  const subject = `ERP: Thread & buttons photo uploaded — ${match.so_number} ${article}`;

  const text = [
    "Garment ERP — Thread & buttons photo",
    "",
    "An operator uploaded a photo on Thread & buttons.",
    "Review it on the Thread & buttons page or acknowledge from the admin dashboard.",
    "",
    `- ${match.so_number} · ${article} · ${match.fabric_number}`,
    `  Client: ${match.client_name} (${match.client_code})`,
    `  Garment: ${match.garment_type}`,
    `  Cut code: ${match.fabric_cut_code ?? "—"}`,
    `  File: ${photo.filename}`,
    `  Uploaded by: ${photo.uploaded_by ?? "unknown"}`,
    "",
    `Open Thread & buttons: ${appUrl}/thread-buttons`,
    `Dashboard: ${appUrl}/dashboard`,
    "",
    "This is an automated message from Garment ERP.",
  ].join("\n");

  try {
    await sendEmail({ to: recipients, subject, text });
    return true;
  } catch (error) {
    console.error("Failed to send thread/button photo alert email:", error);
    return false;
  }
}
