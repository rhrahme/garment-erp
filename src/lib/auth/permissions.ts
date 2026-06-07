import type { UserRole } from "@/lib/types/database";

const CLIENT_MANAGER_ROUTE_PREFIXES = [
  "/clients",
  "/fabric-specification",
  "/orders",
  "/fabric-receiving",
  "/production",
  "/quality",
  "/api/clients",
  "/api/sales-orders",
  "/api/fabric-search",
  "/api/fabric-brands",
  "/api/fabric-receiving",
  "/api/qr",
  "/api/integrations/drapers/medias",
  "/api/factory/floor-stations",
  "/api/production",
  "/api/auth/session",
  "/api/auth/dev-impersonate",
  "/login",
] as const;

/**
 * QC logins — always restricted (no prices, limited menu) even if
 * CLIENT_MANAGER_EMAILS is missing from a deploy.
 */
const BUILTIN_CLIENT_MANAGER_EMAILS = ["hagan.qc@gmail.com"] as const;

/** Sidebar label for QC production orders (same `/orders` routes, production-focused UI). */
export const CLIENT_MANAGER_ORDERS_NAV_LABEL = "Production Orders";

/** Sidebar pages for QC / client-manager accounts (subset of admin ERP). */
export const CLIENT_MANAGER_NAV_HREFS = [
  "/orders",
  "/fabric-receiving",
  "/production",
  "/quality",
  "/clients",
  "/fabric-specification",
] as const;

export function parseSuperAdminEmails(): Set<string> {
  const raw = process.env.SUPER_ADMIN_EMAILS?.trim() ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function parseAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS?.trim() ?? "";
  const fromEnv = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...parseSuperAdminEmails(), ...fromEnv]);
}

export function isSuperAdminRole(role: UserRole | null | undefined): boolean {
  return role === "super_admin";
}

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === "super_admin" || role === "admin";
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseSuperAdminEmails().has(email.trim().toLowerCase());
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails().has(email.trim().toLowerCase());
}

export function parseClientManagerEmails(): Set<string> {
  const raw = process.env.CLIENT_MANAGER_EMAILS?.trim() ?? "";
  const fromEnv = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...BUILTIN_CLIENT_MANAGER_EMAILS, ...fromEnv]);
}

export function isClientManagerRole(role: UserRole | null | undefined): boolean {
  return role === "client_manager";
}

export function isClientManagerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseClientManagerEmails().has(email.trim().toLowerCase());
}

export function isClientManagerAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined
): boolean {
  return isClientManagerRole(role) || isClientManagerEmail(email);
}

export function canViewClientContact(
  role: UserRole | null | undefined,
  email: string | null | undefined,
  isSuperAdmin: boolean
): boolean {
  if (isSuperAdmin) return true;
  return !isClientManagerAccess(role, email);
}

export function isClientManagerRouteAllowed(pathname: string): boolean {
  return CLIENT_MANAGER_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function defaultPathForSession(isClientManager: boolean): string {
  return isClientManager ? "/orders" : "/dashboard";
}
