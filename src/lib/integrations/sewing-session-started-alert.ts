import { parseAdminEmails } from "@/lib/auth/permissions";
import { sendEmail } from "@/lib/email/smtp";
import type { SewingSession } from "@/lib/types/sewing-sessions";

/** Email ADMIN_EMAILS + SUPER_ADMIN_EMAILS when a stitch kiosk opens a new piece session. */
export async function notifyAdminsOfSewingSessionStarted(
  session: Pick<
    SewingSession,
    | "id"
    | "employee_name"
    | "employee_id_number"
    | "production_code"
    | "scan_code"
    | "piece_mark"
    | "fabric_number"
    | "garment_type"
    | "client_name"
    | "so_number"
    | "kiosk_id"
    | "workstation_id"
    | "started_at"
    | "work_kind"
    | "activity_job_function"
  >
): Promise<boolean> {
  const recipients = [...parseAdminEmails()];
  if (recipients.length === 0) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  const subject = `ERP: stitch scan ${session.production_code} (${session.employee_name})`;

  const text = [
    "Garment ERP - new stitch kiosk scan",
    "",
    "A stitcher opened a new piece session on the stitch kiosk.",
    "",
    `- Employee: ${session.employee_name}${
      session.employee_id_number ? ` (ID ${session.employee_id_number})` : ""
    }`,
    `- Production code: ${session.production_code}`,
    `- Scan QR: ${session.scan_code}`,
    `- Piece: ${session.piece_mark ?? "-"}`,
    `- Fabric: ${session.fabric_number ?? "-"}`,
    `- Garment: ${session.garment_type ?? "-"}`,
    `- Client: ${session.client_name ?? "-"}`,
    `- SO: ${session.so_number ?? "-"}`,
    `- Work kind: ${session.work_kind ?? "first_make"}`,
    session.activity_job_function
      ? `- Activity: ${session.activity_job_function}`
      : null,
    `- Kiosk: ${session.kiosk_id}${
      session.workstation_id ? ` / ${session.workstation_id}` : ""
    }`,
    `- Started: ${session.started_at}`,
    `- Session: ${session.id}`,
    "",
    `Stitch Live: ${appUrl}/stitch?tab=live`,
    `Stitch History: ${appUrl}/stitch?tab=history`,
    "",
    "This is an automated message from Garment ERP.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  try {
    await sendEmail({ to: recipients, subject, text });
    return true;
  } catch (error) {
    console.error("Failed to send sewing session started alert email:", error);
    return false;
  }
}
