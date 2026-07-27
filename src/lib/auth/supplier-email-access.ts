import type { SessionContext } from "@/lib/auth/session";

/** Only admins may send supplier / fabric-order emails (SMTP). Others may view drafts and history. */
export function canSendSupplierEmails(session: Pick<SessionContext, "isAdmin">): boolean {
  return session.isAdmin;
}
