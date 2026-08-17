import { sendEmail } from "@/lib/email/smtp";

/**
 * Email the account that filed a request when an admin decides it, so the
 * concerned team member always learns the outcome (approve or reject) no
 * matter where the admin acted from (dashboard, email link, API).
 * Silently skips when the requester is not an email address.
 */
export async function notifyRequesterOfAdminDecision(options: {
  requester: string | null | undefined;
  subject: string;
  lines: string[];
}): Promise<void> {
  const to = options.requester?.trim() ?? "";
  if (!to.includes("@")) return;
  const text = [
    ...options.lines,
    "",
    "This is an automated message from Garment ERP.",
  ].join("\n");
  try {
    await sendEmail({ to: [to], subject: options.subject, text });
  } catch (error) {
    console.error(`Failed to notify requester ${to} of admin decision:`, error);
  }
}
