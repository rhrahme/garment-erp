import { parseAdminEmails } from "@/lib/auth/permissions";
import { sendEmail } from "@/lib/email/smtp";
import type { PatternOperatorNotice } from "@/lib/types/pattern-operator-notices";

async function emailAdmins(subject: string, text: string): Promise<boolean> {
  const recipients = [...parseAdminEmails()];
  if (recipients.length === 0) return false;
  try {
    await sendEmail({ to: recipients, subject, text });
    return true;
  } catch (error) {
    console.error("Failed to email admin about Pattern how-to:", error);
    return false;
  }
}

export async function emailOwnerPatternHowToSent(
  notice: PatternOperatorNotice
): Promise<boolean> {
  return emailAdmins(
    `Sent Pattern: ${notice.title}`,
    [
      "Garment ERP sent this how-to to both Pattern accounts",
      "(hagan.dp1@gmail.com and pattern@hagan.pro).",
      "Pattern 2 also sees the same banner on /pattern when they badge in (XX22).",
      "",
      notice.title,
      "",
      notice.body,
      "",
      "You will get another email when a Pattern operator opens /pattern and sees this banner.",
    ].join("\n")
  );
}

export async function emailOwnerPatternHowToSeen(input: {
  notice: PatternOperatorNotice;
  seenBy: string;
}): Promise<boolean> {
  return emailAdmins(
    `Pattern saw the how-to: ${input.notice.title}`,
    [
      `${input.seenBy} opened Pattern and saw this how-to.`,
      "",
      input.notice.title,
      "",
      input.notice.body,
    ].join("\n")
  );
}
