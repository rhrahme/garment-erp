import type { UserRole } from "@/lib/types/database";

const CLIENT_MANAGER_ROUTE_PREFIXES = [
  "/clients",
  "/fabric-specification",
  "/fabric-orders",
  "/orders",
  "/fabric-receiving",
  "/thread-buttons",
  "/production",
  "/quality",
  "/api/clients",
  "/api/custom-fabrics",
  "/api/sales-orders",
  "/api/fabric-search",
  "/api/fabric-brands",
  "/api/fabric-receiving",
  "/api/thread-button-matching",
  "/api/fabric-transfers",
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
  "/thread-buttons",
  "/fabric-specification",
  "/orders",
  "/api/fabric-receiving",
  "/api/thread-button-matching",
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
 * Factory manager — everything inside the factory except accounting/costs.
 * Prefer allowing operational pages (with price lockdown) over hiding them.
 */
const PRODUCTION_OPERATOR_ROUTE_PREFIXES = [
  "/production",
  "/fabric-receiving",
  "/thread-buttons",
  "/orders",
  "/quality",
  "/fabric-specification",
  "/clients",
  "/brands",
  "/ready-made",
  "/pattern",
  "/inventory",
  "/shipments",
  "/washing",
  /** Employee list + QR badges only — payroll register stays blocked via `/hr`. */
  "/hr/id-badges",
  "/api/production",
  "/api/fabric-receiving",
  "/api/thread-button-matching",
  "/api/factory/floor-stations",
  "/api/sales-orders",
  "/api/qr",
  "/api/fabric-brands",
  "/api/fabric-search",
  "/api/custom-fabrics",
  "/api/clients",
  "/api/pattern",
  "/api/shipments",
  "/api/hr/employees",
  "/api/hr/employee-lookup",
  "/api/hr/id-badges",
  "/api/suppliers/loro-piana",
  "/api/integrations/drapers/medias",
  "/api/auth/session",
  "/api/auth/dev-impersonate",
  "/login",
] as const;

export const PRODUCTION_OPERATOR_BLOCKED_ROUTE_PREFIXES = [
  "/orders/new",
  "/fabric-orders",
  "/invoices",
  "/costing",
  "/supplier-emails",
  "/supplier-inbox",
  "/supplier-invoices",
  "/purchasing",
  "/hr",
  "/documents",
  "/sales",
] as const;

/**
 * Pattern team — pattern library + drafting queue, clients (contacts hidden),
 * fabric specification. No prices, no orders create, no accounting/HR/sales CRM.
 */
const PATTERN_OPERATOR_ROUTE_PREFIXES = [
  "/pattern",
  "/clients",
  "/fabric-specification",
  "/api/pattern",
  "/api/clients",
  "/api/custom-fabrics",
  "/api/fabric-search",
  "/api/fabric-brands",
  "/api/qr",
  "/api/suppliers/loro-piana",
  "/api/integrations/drapers/medias",
  "/api/auth/session",
  "/api/auth/dev-impersonate",
  "/login",
] as const;

const SALES_OPERATOR_ROUTE_PREFIXES = [
  "/sales",
  "/clients",
  "/fabric-specification",
  "/orders",
  "/invoices",
  "/api/clients",
  "/api/custom-fabrics",
  "/api/sales-orders",
  "/api/fabric-search",
  "/api/fabric-brands",
  "/api/supplier-fabrics",
  "/api/customer-invoices",
  "/api/sales",
  "/api/qr",
  "/api/suppliers/loro-piana",
  "/api/integrations/drapers/medias",
  "/api/auth/session",
  "/api/auth/dev-impersonate",
  "/login",
] as const;

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

/**
 * Factory managers — pipeline visibility & stage advance; watch wash/iron; no prices/accounting.
 */
const BUILTIN_PRODUCTION_OPERATOR_EMAILS = ["production@hagan.pro"] as const;

/** Sidebar label for QC production orders (same `/orders` routes, production-focused UI). */
export const CLIENT_MANAGER_ORDERS_NAV_LABEL = "Production Orders";

/** Sidebar label for task-operator production orders. */
export const TASK_OPERATOR_ORDERS_NAV_LABEL = "Print orders";

/** Sidebar label for factory-manager production orders. */
export const PRODUCTION_OPERATOR_ORDERS_NAV_LABEL = "Factory orders";

/** Sidebar pages for QC / client-manager accounts (subset of admin ERP). */
export const CLIENT_MANAGER_NAV_HREFS = [
  "/fabric-orders",
  "/orders",
  "/fabric-receiving",
  "/thread-buttons",
  "/production",
  "/quality",
  "/clients",
  "/fabric-specification",
] as const;

/** Sidebar pages for production-floor task operators. */
export const TASK_OPERATOR_NAV_HREFS = [
  "/fabric-receiving",
  "/thread-buttons",
  "/orders",
  "/fabric-specification",
] as const;

/**
 * Sidebar for factory managers — full factory ops, no sales CRM / accounting / payroll.
 * Stickers & A4 printing live under Factory orders (`/orders`).
 * Employees = ID badges + create (not payroll register).
 * Landing stays `/production` (not Sales Home, not admin Dashboard).
 */
export const PRODUCTION_OPERATOR_NAV_HREFS = [
  "/fabric-receiving",
  "/thread-buttons",
  "/brands",
  "/clients",
  "/ready-made",
  "/fabric-specification",
  "/pattern",
  "/inventory",
  "/production",
  "/production/floor-map",
  "/orders",
  "/shipments",
  "/washing",
  "/quality",
  "/hr/id-badges",
] as const;

export const SALES_OPERATOR_NAV_HREFS = [
  "/sales",
  "/clients",
  "/fabric-specification",
  "/orders",
  "/invoices",
] as const;

/** Sidebar for the pattern team — library + queue, clients (contacts hidden), fabric spec. */
export const PATTERN_OPERATOR_NAV_HREFS = [
  "/pattern",
  "/clients",
  "/fabric-specification",
] as const;

export type RestrictedAccessKind =
  | "client_manager"
  | "task_operator"
  | "production_operator"
  | "pattern_operator"
  | "sales_operator";

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

export function parseProductionEmails(): Set<string> {
  const raw = process.env.PRODUCTION_EMAILS?.trim() ?? "";
  const fromEnv = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...BUILTIN_PRODUCTION_OPERATOR_EMAILS, ...fromEnv]);
}

export function parsePatternEmails(): Set<string> {
  const raw = process.env.PATTERN_EMAILS?.trim() ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function parseSalesEmails(): Set<string> {
  const raw = process.env.SALES_EMAILS?.trim() ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isClientManagerRole(role: UserRole | null | undefined): boolean {
  return role === "client_manager";
}

export function isTaskOperatorRole(role: UserRole | null | undefined): boolean {
  return role === "task_operator";
}

export function isProductionOperatorRole(role: UserRole | null | undefined): boolean {
  return role === "production_operator";
}

export function isSalesOperatorRole(role: UserRole | null | undefined): boolean {
  return role === "sales_operator";
}

/** `pattern_maker` is the pre-existing (dormant) DB role — treated as the same access. */
export function isPatternOperatorRole(role: UserRole | null | undefined): boolean {
  return role === "pattern_operator" || role === "pattern_maker";
}

export function isClientManagerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseClientManagerEmails().has(email.trim().toLowerCase());
}

export function isTaskOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseTaskOperatorEmails().has(email.trim().toLowerCase());
}

export function isProductionOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseProductionEmails().has(email.trim().toLowerCase());
}

export function isSalesOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseSalesEmails().has(email.trim().toLowerCase());
}

export function isPatternOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parsePatternEmails().has(email.trim().toLowerCase());
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

export function isProductionOperatorAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined
): boolean {
  if (
    isClientManagerAccess(role, email) ||
    isTaskOperatorAccess(role, email)
  ) {
    return false;
  }
  return isProductionOperatorRole(role) || isProductionOperatorEmail(email);
}

export function isPatternOperatorAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined
): boolean {
  if (
    isClientManagerAccess(role, email) ||
    isTaskOperatorAccess(role, email) ||
    isProductionOperatorAccess(role, email)
  ) {
    return false;
  }
  return isPatternOperatorRole(role) || isPatternOperatorEmail(email);
}

export function isSalesOperatorAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined
): boolean {
  if (
    isClientManagerAccess(role, email) ||
    isTaskOperatorAccess(role, email) ||
    isProductionOperatorAccess(role, email) ||
    isPatternOperatorAccess(role, email)
  ) {
    return false;
  }
  return isSalesOperatorRole(role) || isSalesOperatorEmail(email);
}

/** Accounts that must never see prices (QC, task, factory manager, pattern, sales). */
export function isPriceRestrictedAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined
): boolean {
  return (
    isClientManagerAccess(role, email) ||
    isTaskOperatorAccess(role, email) ||
    isProductionOperatorAccess(role, email) ||
    isPatternOperatorAccess(role, email) ||
    isSalesOperatorAccess(role, email)
  );
}

export function resolveRestrictedAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined,
  isSuperAdmin = false
): RestrictedAccessKind | null {
  if (isSuperAdmin) return null;
  if (isClientManagerAccess(role, email)) return "client_manager";
  if (isTaskOperatorAccess(role, email)) return "task_operator";
  if (isProductionOperatorAccess(role, email)) return "production_operator";
  if (isPatternOperatorAccess(role, email)) return "pattern_operator";
  if (isSalesOperatorAccess(role, email)) return "sales_operator";
  return null;
}

export function canViewClientContact(
  role: UserRole | null | undefined,
  email: string | null | undefined,
  isSuperAdmin: boolean
): boolean {
  if (isSuperAdmin) return true;
  return isSalesOperatorAccess(role, email) || !isPriceRestrictedAccess(role, email);
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
  if (
    pathname.startsWith("/api/sales-orders/") &&
    pathname.includes("/fabric-lines/transfer")
  ) {
    return false;
  }
  return TASK_OPERATOR_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** ID badges under `/hr` — operational identity/QR, not the payroll register. */
export function isHrIdBadgesPath(pathname: string): boolean {
  return pathname === "/hr/id-badges" || pathname.startsWith("/hr/id-badges/");
}

export function isProductionOperatorRouteAllowed(pathname: string): boolean {
  if (
    !isHrIdBadgesPath(pathname) &&
    PRODUCTION_OPERATOR_BLOCKED_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    return false;
  }
  if (
    pathname.startsWith("/api/sales-orders/") &&
    (pathname.includes("/fabric-lines/transfer") || pathname.endsWith("/fabric-pos"))
  ) {
    return false;
  }
  return PRODUCTION_OPERATOR_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isPatternOperatorRouteAllowed(pathname: string): boolean {
  return PATTERN_OPERATOR_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isSalesOperatorRouteAllowed(pathname: string): boolean {
  if (
    pathname.startsWith("/orders/") &&
    (pathname.includes("/print") || pathname.includes("/print-pack"))
  ) {
    return false;
  }
  if (
    pathname.startsWith("/api/sales-orders/") &&
    (pathname.includes("/stickers") ||
      pathname.includes("/fabric-lines/print") ||
      pathname.includes("/fabric-lines/clear-print-timestamps") ||
      pathname.includes("/fabric-lines/transfer") ||
      pathname.endsWith("/fabric-pos"))
  ) {
    return false;
  }
  return SALES_OPERATOR_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isRestrictedRouteAllowed(
  pathname: string,
  access: RestrictedAccessKind
): boolean {
  if (access === "client_manager") return isClientManagerRouteAllowed(pathname);
  if (access === "task_operator") return isTaskOperatorRouteAllowed(pathname);
  if (access === "production_operator") return isProductionOperatorRouteAllowed(pathname);
  if (access === "pattern_operator") return isPatternOperatorRouteAllowed(pathname);
  return isSalesOperatorRouteAllowed(pathname);
}

export type SessionLandingAccess = {
  isClientManager?: boolean;
  isTaskOperator?: boolean;
  isProductionOperator?: boolean;
  isPatternOperator?: boolean;
  isSalesOperator?: boolean;
};

export function landingAccessFromRestricted(
  restrictedAccess: RestrictedAccessKind | null
): SessionLandingAccess {
  return {
    isClientManager: restrictedAccess === "client_manager",
    isTaskOperator: restrictedAccess === "task_operator",
    isProductionOperator: restrictedAccess === "production_operator",
    isPatternOperator: restrictedAccess === "pattern_operator",
    isSalesOperator: restrictedAccess === "sales_operator",
  };
}

/** Mutually exclusive landing from email lists (production wins over sales if both match). */
export function defaultPathForEmail(email: string | null | undefined): string {
  return defaultPathForSession(
    landingAccessFromRestricted(resolveRestrictedAccess(null, email, false))
  );
}

export function defaultPathForSession(access: boolean | SessionLandingAccess): string {
  const isClientManager =
    typeof access === "boolean" ? access : Boolean(access.isClientManager);
  const isTaskOperator =
    typeof access === "boolean" ? false : Boolean(access.isTaskOperator);
  const isProductionOperator =
    typeof access === "boolean" ? false : Boolean(access.isProductionOperator);
  const isPatternOperator =
    typeof access === "boolean" ? false : Boolean(access.isPatternOperator);
  const isSalesOperator =
    typeof access === "boolean" ? false : Boolean(access.isSalesOperator);
  // Production before sales: factory managers must never land on Sales Home.
  if (isProductionOperator) return "/production";
  if (isPatternOperator) return "/pattern";
  if (isSalesOperator) return "/sales";
  if (isTaskOperator) return "/fabric-receiving";
  if (isClientManager) return "/orders";
  return "/dashboard";
}

export function canAccessPatternModule(
  isClientManager: boolean,
  isAdmin: boolean,
  isTaskOperator = false,
  isProductionOperator = false,
  isPatternOperator = false
): boolean {
  if (isAdmin || isProductionOperator || isPatternOperator) return true;
  if (isClientManager || isTaskOperator) return false;
  return true;
}
