import {
  isClientManagerEmail,
  isProductionOperatorEmail,
  isSalesOperatorEmail,
  isTaskOperatorEmail,
} from "@/lib/auth/permissions";

export const DEV_IMPERSONATION_COOKIE = "erp_dev_impersonate_email";

export function isDevImpersonationEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function resolveDevImpersonationEmail(cookieValue: string | undefined | null): string | null {
  if (!isDevImpersonationEnabled()) return null;
  const email = cookieValue?.trim().toLowerCase() ?? null;
  if (
    !email ||
    (!isClientManagerEmail(email) &&
      !isTaskOperatorEmail(email) &&
      !isProductionOperatorEmail(email) &&
      !isSalesOperatorEmail(email))
  ) {
    return null;
  }
  return email;
}
