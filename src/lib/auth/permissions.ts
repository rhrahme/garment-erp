import type { UserRole } from "@/lib/types/database";

const CLIENT_MANAGER_ROUTE_PREFIXES = [
  "/clients",
  "/fabric-specification",
  "/fabric-orders",
  "/orders",
  "/fabric-receiving",
  "/production",
  "/quality",
  "/api/clients",
  "/api/custom-fabrics",
  "/api/sales-orders",
  "/api/fabric-search",
  "/api/fabric-brands",
  "/api/fabric-receiving",
  "/api/suppliers/loro-piana",
  "/api/qr",
  "/api/integrations/drapers/medias",
  "/api/factory/floor-stations",
  "/api/production",
  "/api/auth/session",
  "/api/auth/dev-impersonate",
  "/login",
] as const;

const TASK_OPERATOR_ROUTE_PREFIXES = [
  "/fabric-receiving",
  "/fabric-specification",
  "/orders",
  "/api/fabric-receiving",
  "/api/sales-orders",
  "/api/production",
  "/api/qr",
  "/api/fabric-brands",
  "/api/fabric-search",
  "/api/custom-fabrics",
  "/api/clients",
  "/api/suppliers/loro-piana",
  "/api/integrations/drapers/medias",
  "/api/auth/session",
  "/api/auth/dev-impersonate",
  "/login",
] as const;

const TASK_OPERATOR_BLOCKED_ROUTE_PREFIXES = ["/orders/new", "/fabric-orders"] as const;

/**
 * QC logins — always restricted (no prices, limited menu) even if
 * CLIENT_MANAGER_EMAILS is missing from a deploy.
 */
const BUILTIN_CLIENT_MANAGER_EMAILS = ["hagan.qc@gmail.com"] as const;

/**
 * Production-floor task operators — print labels/A4, wash/iron scan, and custom fabric create.
 * No prices, no order editing, minimal sidebar.
 */
const BUILTIN_TASK_OPERATOR_EMAILS = ["hagan.task1@gmail.com"] as const;

/** Sidebar label for QC production orders (same `/orders` routes, production-focused UI). */
export const CLIENT_MANAGER_ORDERS_NAV_LABEL = "Production Orders";

/** Sidebar label for task-operator production orders. */
export const TASK_OPERATOR_ORDERS_NAV_LABEL = "Print orders";

/** Sidebar pages for QC / client-manager accounts (subset of admin ERP). */
export const CLIENT_MANAGER_NAV_HREFS = [
  "/fabric-orders",
  "/orders",
  "/fabric-receiving",
  "/production",
  "/quality",
  "/clients",
  "/fabric-specification",
] as const;

/** Sidebar pages for production-floor task operators. */
export const TASK_OPERATOR_NAV_HREFS = [
  "/fabric-receiving",
  "/orders",
  "/fabric-specification",
] as const;

export type RestrictedAccessKind = "client_manager" | "task_operator";

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

export function parseTaskOperatorEmails(): Set<string> {
  const raw = process.env.TASK_OPERATOR_EMAILS?.trim() ?? "";
  const fromEnv = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...BUILTIN_TASK_OPERATOR_EMAILS, ...fromEnv]);
}

export function isClientManagerRole(role: UserRole | null | undefined): boolean {
  return role === "client_manager";
}

export function isTaskOperatorRole(role: UserRole | null | undefined): boolean {
  return role === "task_operator";
}

export function isClientManagerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseClientManagerEmails().has(email.trim().toLowerCase());
}

export function isTaskOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseTaskOperatorEmails().has(email.trim().toLowerCase());
}

export function isClientManagerAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined
): boolean {
  return isClientManagerRole(role) || isClientManagerEmail(email);
}

export function isTaskOperatorAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined
): boolean {
  if (isClientManagerAccess(role, email)) return false;
  return isTaskOperatorRole(role) || isTaskOperatorEmail(email);
}

/** Accounts that must never see prices (QC and production-floor operators). */
export function isPriceRestrictedAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined
): boolean {
  return isClientManagerAccess(role, email) || isTaskOperatorAccess(role, email);
}

export function resolveRestrictedAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined,
  isSuperAdmin = false
): RestrictedAccessKind | null {
  if (isSuperAdmin) return null;
  if (isClientManagerAccess(role, email)) return "client_manager";
  if (isTaskOperatorAccess(role, email)) return "task_operator";
  return null;
}

export function canViewClientContact(
  role: UserRole | null | undefined,
  email: string | null | undefined,
  isSuperAdmin: boolean
): boolean {
  if (isSuperAdmin) return true;
  return !isPriceRestrictedAccess(role, email);
}

export function isClientManagerRouteAllowed(pathname: string): boolean {
  return CLIENT_MANAGER_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isTaskOperatorRouteAllowed(pathname: string): boolean {
  if (
    TASK_OPERATOR_BLOCKED_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    return false;
  }
  return TASK_OPERATOR_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isRestrictedRouteAllowed(
  pathname: string,
  access: RestrictedAccessKind
): boolean {
  return access === "client_manager"
    ? isClientManagerRouteAllowed(pathname)
    : isTaskOperatorRouteAllowed(pathname);
}

export type SessionLandingAccess = {
  isClientManager?: boolean;
  isTaskOperator?: boolean;
};

export function defaultPathForSession(access: boolean | SessionLandingAccess): string {
  const isClientManager =
    typeof access === "boolean" ? access : Boolean(access.isClientManager);
  const isTaskOperator =
    typeof access === "boolean" ? false : Boolean(access.isTaskOperator);
  if (isTaskOperator) return "/fabric-receiving";
  if (isClientManager) return "/orders";
  return "/dashboard";
}

export function canAccessPatternModule(
  isClientManager: boolean,
  isAdmin: boolean,
  isTaskOperator = false
): boolean {
  if (isAdmin) return true;
  if (isClientManager || isTaskOperator) return false;
  return true;
}
