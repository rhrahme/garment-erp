/**
 * Emails that must not sign in via the email tab. Edge-safe (no Node APIs).
 * Mohtajul uses badge 2625917972 only; historical writes stay mapped in
 * PATTERN_EMAIL_EMPLOYEES.
 */
const EMAIL_LOGIN_DISABLED = new Set(["hagan.dp1@gmail.com"]);

export const EMAIL_LOGIN_DISABLED_MESSAGE =
  "This account now signs in with badge number, not email. Use the Badge tab.";

export function isEmailLoginDisabled(email: string | null | undefined): boolean {
  if (!email) return false;
  return EMAIL_LOGIN_DISABLED.has(email.trim().toLowerCase());
}
