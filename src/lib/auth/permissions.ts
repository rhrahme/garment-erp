import type { UserRole } from "@/lib/types/database";

export function parseSuperAdminEmails(): Set<string> {
  const raw = process.env.SUPER_ADMIN_EMAILS?.trim() ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isSuperAdminRole(role: UserRole | null | undefined): boolean {
  return role === "super_admin";
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseSuperAdminEmails().has(email.trim().toLowerCase());
}
