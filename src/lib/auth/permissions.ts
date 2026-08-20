import type { UserRole } from "@/lib/types/database";

/** Fabric swatch lookup + image proxy routes used by preview/eye UI. */
const FABRIC_SWATCH_ROUTE_PREFIXES = [
  "/api/suppliers/loro-piana",
  "/api/suppliers/caccioppoli",
  /** Cached Drapers swatch list + image proxy (drapersSwatchImageUrl). */
  "/api/suppliers/drapers",
  "/api/integrations/drapers/medias",
  /** Legacy live getItemImages route (admin/diagnostic); UI thumbs use /api/suppliers/caccioppoli. */
  "/api/integrations/caccioppoli/images",
] as const;

/** Sitewide fabric / garment / article photo uploads. */
const ENTITY_IMAGE_ROUTE_PREFIXES = ["/api/entity-images"] as const;

const CLIENT_MANAGER_ROUTE_PREFIXES = [
  "/clients",
  "/fabric-specification",
  "/custom-fabrics",
  "/fabric-orders",
  "/orders",
  "/fabric-receiving",
  "/thread-buttons",
  "/production",
  "/quality",
  /** ID badges only -- payroll register `/hr` stays blocked (allowlist, not prefix `/hr`). */
  "/hr/id-badges",
  "/api/clients",
  "/api/client-samples",
  "/api/custom-fabrics",
  "/api/sales-orders",
  /** Server backup of in-progress order forms (QC/client managers create orders). */
  "/api/sales-order-drafts",
  "/api/fabric-order-drafts",
  "/api/fabric-search",
  "/api/fabric-brands",
  "/api/fabric-receiving",
  "/api/thread-button-matching",
  "/api/fabric-transfers",
  "/api/garment-type-changes",
  "/api/fabric-change-alerts",
  ...FABRIC_SWATCH_ROUTE_PREFIXES,
  ...ENTITY_IMAGE_ROUTE_PREFIXES,
  "/api/qr",
  "/api/factory/floor-stations",
  "/api/production",
  "/api/quality",
  "/api/sales",
  "/api/hr/employees",
  "/api/hr/employee-lookup",
  "/api/hr/id-badges",
  "/api/auth/session",
  "/api/auth/dev-impersonate",
  "/login",
] as const;

const TASK_OPERATOR_ROUTE_PREFIXES = [
  "/fabric-receiving",
  "/thread-buttons",
  "/fabric-specification",
  "/custom-fabrics",
  "/orders",
  /** Every team can record client ready-made samples (badge-scan receive). */
  "/clients",
  "/api/fabric-receiving",
  "/api/thread-button-matching",
  "/api/sales-orders",
  "/api/production",
  "/api/qr",
  "/api/fabric-brands",
  "/api/fabric-search",
  "/api/custom-fabrics",
  "/api/clients",
  "/api/client-samples",
  ...FABRIC_SWATCH_ROUTE_PREFIXES,
  ...ENTITY_IMAGE_ROUTE_PREFIXES,
  "/api/auth/session",
  "/api/auth/dev-impersonate",
  "/login",
] as const;

const TASK_OPERATOR_BLOCKED_ROUTE_PREFIXES = ["/orders/new", "/fabric-orders"] as const;

/**
 * Stitch floor kiosk - sewing badge/A4 scans + read-only orders board.
 * Landing `/stitch`; shared path `/production/stitch` also allowed.
 * Writes (stage-scan, stickers, SO mutations) stay blocked in isStitchOperatorRouteAllowed.
 */
const STITCH_OPERATOR_ROUTE_PREFIXES = [
  "/stitch",
  "/production/stitch",
  /** Every team can record client ready-made samples (badge-scan receive). */
  "/clients",
  "/api/clients",
  "/api/client-samples",
  "/api/production/sewing-session",
  "/api/production/work-orders",
  "/api/sales-orders",
  "/api/qr",
  "/api/hr/employee-lookup",
  ...FABRIC_SWATCH_ROUTE_PREFIXES,
  ...ENTITY_IMAGE_ROUTE_PREFIXES,
  "/api/auth/session",
  "/api/auth/dev-impersonate",
  "/login",
] as const;

/**
 * Factory manager - everything inside the factory except accounting/costs.
 * Prefer allowing operational pages (with price lockdown) over hiding them.
 */
const PRODUCTION_OPERATOR_ROUTE_PREFIXES = [
  "/stitch",
  "/production",
  "/fabric-receiving",
  "/thread-buttons",
  "/orders",
  "/quality",
  "/fabric-specification",
  "/custom-fabrics",
  "/clients",
  "/brands",
  "/ready-made",
  "/api/ready-made",
  "/pattern",
  "/inventory",
  "/shipments",
  "/washing",
  /** Employee list + QR badges only - payroll register stays blocked via `/hr`. */
  "/hr/id-badges",
  "/api/production",
  "/api/quality",
  "/api/fabric-receiving",
  "/api/thread-button-matching",
  "/api/factory/floor-stations",
  "/api/sales-orders",
  "/api/garment-type-changes",
  "/api/fabric-change-alerts",
  "/api/qr",
  "/api/fabric-brands",
  "/api/fabric-search",
  "/api/custom-fabrics",
  "/api/clients",
  "/api/client-samples",
  "/api/pattern",
  "/api/inventory",
  "/api/shipments",
  "/api/hr/employees",
  "/api/hr/employee-lookup",
  "/api/hr/id-badges",
  "/api/sales",
  ...FABRIC_SWATCH_ROUTE_PREFIXES,
  ...ENTITY_IMAGE_ROUTE_PREFIXES,
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
 * Pattern team - pattern library + drafting queue, clients (contacts hidden),
 * fabric specification, stitch kiosk visibility. No prices, no orders create,
 * no accounting/HR/sales CRM. Pause control stays admin-only.
 */
const PATTERN_OPERATOR_ROUTE_PREFIXES = [
  "/pattern",
  "/clients",
  "/fabric-specification",
  "/custom-fabrics",
  // Stitch kiosk (Scan / Live / History / Orders) - same APIs as stitch@.
  "/stitch",
  "/production/stitch",
  "/api/production/sewing-session",
  "/api/production/work-orders",
  "/api/sales-orders",
  "/api/pattern",
  "/api/clients",
  "/api/client-samples",
  "/api/custom-fabrics",
  "/api/fabric-search",
  "/api/fabric-brands",
  "/api/qr",
  "/api/garment-type-changes",
  "/api/fabric-change-alerts",
  // Optional badge scan on Pattern stage scan (who scanned + when).
  "/api/hr/employee-lookup",
  // Pattern assigns sales-uploaded wearing photos to fabric lines / articles.
  "/api/sales/client-photos",
  ...FABRIC_SWATCH_ROUTE_PREFIXES,
  ...ENTITY_IMAGE_ROUTE_PREFIXES,
  "/api/auth/session",
  "/api/auth/dev-impersonate",
  "/login",
] as const;

/**
 * Accounting - invoicing, costing, supplier invoices, purchasing; no factory floor or sales CRM.
 * Money is admin-only (canViewMoney) - accounting sees invoice/PO workflow, never amounts.
 * Supplier emails: view-only - sending is admin-only (canSendSupplierEmails).
 * AWB tracking: view-only - add/sync is admin + factory manager (canManageShipments).
 */
const ACCOUNTING_OPERATOR_ROUTE_PREFIXES = [
  "/invoices",
  "/costing",
  "/fabric-orders",
  "/supplier-emails",
  "/supplier-inbox",
  "/supplier-invoices",
  "/purchasing",
  "/documents",
  "/clients",
  "/orders",
  "/shipments",
  "/api/customer-invoices",
  "/api/supplier-invoices",
  "/api/fabric-orders",
  "/api/supplier-emails",
  "/api/supplier-replies",
  "/api/email",
  "/api/supplier-contacts",
  "/api/fabric-order-drafts",
  "/api/clients",
  "/api/client-samples",
  "/api/sales-orders",
  "/api/reference-documents",
  "/api/transporter-invoices",
  "/api/exchange-rates",
  "/api/supplier-availability-alerts",
  "/api/price-list-items",
  "/api/fabric-brands",
  "/api/v1/suppliers",
  "/api/shipments",
  "/api/auth/session",
  "/api/auth/invoice-amounts",
  "/api/auth/dev-impersonate",
  "/login",
] as const;

const ACCOUNTING_OPERATOR_BLOCKED_ROUTE_PREFIXES = [
  "/orders/new",
  "/production",
  "/pattern",
  "/sales",
  "/quality",
  "/washing",
  "/hr",
  "/fabric-receiving",
  "/thread-buttons",
  "/brands",
  "/ready-made",
  "/inventory",
  "/fabric-specification",
  "/dashboard",
  "/api/fabric-orders/send-email",
  "/api/email/send-test",
  "/api/v1/fabric-orders",
] as const;

const SALES_OPERATOR_ROUTE_PREFIXES = [
  "/sales",
  "/clients",
  /** Client-facing lookbooks - sales presents these. */
  "/marketing",
  "/fabric-specification",
  "/custom-fabrics",
  "/orders",
  "/invoices",
  "/api/clients",
  "/api/client-samples",
  "/api/custom-fabrics",
  "/api/sales-orders",
  "/api/fabric-search",
  "/api/fabric-brands",
  "/api/supplier-fabrics",
  "/api/customer-invoices",
  "/api/sales",
  "/api/qr",
  "/api/garment-type-changes",
  "/api/fabric-change-alerts",
  ...FABRIC_SWATCH_ROUTE_PREFIXES,
  ...ENTITY_IMAGE_ROUTE_PREFIXES,
  "/api/auth/session",
  "/api/auth/dev-impersonate",
  "/login",
] as const;

/**
 * QC logins - always restricted (no prices, limited menu) even if
 * CLIENT_MANAGER_EMAILS is missing from a deploy.
 */
const BUILTIN_CLIENT_MANAGER_EMAILS = ["hagan.qc@gmail.com"] as const;

/**
 * Production-floor task operators - print labels/A4, wash/iron scan, and custom fabric create
 * (sales can view Fabric Spec / custom fabrics but cannot POST create — see canCreateCustomFabric).
 * No prices, no order editing, minimal sidebar.
 */
const BUILTIN_TASK_OPERATOR_EMAILS = ["hagan.task1@gmail.com"] as const;

/**
 * Factory managers - pipeline visibility & stage advance; watch wash/iron; no prices/accounting.
 */
const BUILTIN_PRODUCTION_OPERATOR_EMAILS = ["production@hagan.pro"] as const;

/**
 * Stitch floor kiosk logins - sewing session scans only; works without STITCH_EMAILS on deploy.
 */
const BUILTIN_STITCH_OPERATOR_EMAILS = ["stitch@hagan.pro"] as const;

/** Tablet sales - client/catalog/order/invoice access; works without SALES_EMAILS on deploy. */
const BUILTIN_SALES_OPERATOR_EMAILS = ["sales1@hagan.pro"] as const;

/** Accounting logins - invoicing & supplier billing; works without ACCOUNTING_EMAILS on deploy. */
const BUILTIN_ACCOUNTING_OPERATOR_EMAILS = ["accounting@hagan.pro"] as const;

/** Sidebar label for QC production orders (same `/orders` routes, production-focused UI). */
export const CLIENT_MANAGER_ORDERS_NAV_LABEL = "Production Orders";

/** Sidebar label for task-operator production orders. */
export const TASK_OPERATOR_ORDERS_NAV_LABEL = "Print orders";

/** Sidebar label for factory-manager production orders. */
export const PRODUCTION_OPERATOR_ORDERS_NAV_LABEL = "Factory orders";

/** Sidebar label for stitch floor kiosk. */
export const STITCH_OPERATOR_NAV_LABEL = "Stitch";

/** Sidebar label for stitch floor orders board (under Stitch, not full `/orders`). */
export const STITCH_OPERATOR_ORDERS_NAV_LABEL = "Orders";

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
  /** ID badges only -- not `/hr` payroll register. */
  "/hr/id-badges",
] as const;

/** Sidebar pages for production-floor task operators. */
export const TASK_OPERATOR_NAV_HREFS = [
  "/fabric-receiving",
  "/thread-buttons",
  "/orders",
  "/fabric-specification",
  "/clients",
] as const;

/**
 * Sidebar for factory managers - full factory ops, no sales CRM / accounting / payroll.
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
  "/stitch",
  "/production/floor-map",
  "/orders",
  "/shipments",
  "/washing",
  "/quality",
  "/hr/id-badges",
] as const;

/** Sidebar for stitch floor - kiosk + orders board (not full QC `/orders`). */
export const STITCH_OPERATOR_NAV_HREFS = ["/stitch", "/stitch/orders", "/clients"] as const;

export const SALES_OPERATOR_NAV_HREFS = [
  "/sales",
  "/clients",
  "/marketing",
  "/fabric-specification",
  "/orders",
  "/invoices",
] as const;

/** Sidebar for the pattern team - library + queue, clients, fabric spec, stitch kiosk. */
export const PATTERN_OPERATOR_NAV_HREFS = [
  "/pattern",
  "/clients",
  "/fabric-specification",
  "/stitch",
] as const;

/** Inventory clerk - trims / hangers / cartons only. Nothing else. */
export const INVENTORY_CLERK_NAV_HREFS = ["/inventory"] as const;

const INVENTORY_CLERK_ROUTE_PREFIXES = [
  "/inventory",
  "/api/inventory",
  "/api/auth/session",
  "/api/auth/dev-impersonate",
  "/login",
] as const;

/** Sidebar for accounting - finance & supplier billing, no factory floor or sales CRM. */
export const ACCOUNTING_OPERATOR_NAV_HREFS = [
  "/invoices",
  "/costing",
  "/fabric-orders",
  "/supplier-emails",
  "/supplier-inbox",
  "/supplier-invoices",
  "/purchasing",
  "/shipments",
  "/clients",
  "/documents",
] as const;

export type RestrictedAccessKind =
  | "client_manager"
  | "task_operator"
  | "stitch_operator"
  | "production_operator"
  | "pattern_operator"
  | "inventory_clerk"
  | "sales_operator"
  | "accounting";

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

export function parseStitchEmails(): Set<string> {
  const raw = process.env.STITCH_EMAILS?.trim() ?? "";
  const fromEnv = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...BUILTIN_STITCH_OPERATOR_EMAILS, ...fromEnv]);
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
  const fromEnv = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...BUILTIN_SALES_OPERATOR_EMAILS, ...fromEnv]);
}

export function parseAccountingEmails(): Set<string> {
  const raw = process.env.ACCOUNTING_EMAILS?.trim() ?? "";
  const fromEnv = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...BUILTIN_ACCOUNTING_OPERATOR_EMAILS, ...fromEnv]);
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

export function isStitchOperatorRole(role: UserRole | null | undefined): boolean {
  return role === "stitch_operator";
}

export function isSalesOperatorRole(role: UserRole | null | undefined): boolean {
  return role === "sales_operator";
}

export function isAccountingOperatorRole(role: UserRole | null | undefined): boolean {
  return role === "accounting";
}

/** `pattern_maker` is the pre-existing (dormant) DB role - treated as the same access. */
export function isPatternOperatorRole(role: UserRole | null | undefined): boolean {
  return role === "pattern_operator" || role === "pattern_maker";
}

export function isInventoryClerkRole(role: UserRole | null | undefined): boolean {
  return role === "inventory_clerk";
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

export function isStitchOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseStitchEmails().has(email.trim().toLowerCase());
}

export function isSalesOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseSalesEmails().has(email.trim().toLowerCase());
}

/**
 * Synthetic accounts from badge-number login (see lib/auth/badge-login.ts).
 * Role is encoded in the email so permission fallbacks work even when the
 * profiles read is degraded. Keep edge-safe: regex only, no node imports.
 */
const BADGE_PATTERN_LOGIN_EMAIL = /^badge-pattern-[a-z0-9]+@badge\.hagan\.pro$/;
const BADGE_INVENTORY_LOGIN_EMAIL = /^badge-inventory-[a-z0-9]+@badge\.hagan\.pro$/;

export function isPatternOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (BADGE_PATTERN_LOGIN_EMAIL.test(normalized)) return true;
  return parsePatternEmails().has(normalized);
}

export function isInventoryClerkEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return BADGE_INVENTORY_LOGIN_EMAIL.test(email.trim().toLowerCase());
}

export function isAccountingOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAccountingEmails().has(email.trim().toLowerCase());
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

export function isStitchOperatorAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined
): boolean {
  if (isClientManagerAccess(role, email) || isTaskOperatorAccess(role, email)) {
    return false;
  }
  return isStitchOperatorRole(role) || isStitchOperatorEmail(email);
}

export function isProductionOperatorAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined
): boolean {
  if (
    isClientManagerAccess(role, email) ||
    isTaskOperatorAccess(role, email) ||
    isStitchOperatorAccess(role, email)
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
    isStitchOperatorAccess(role, email) ||
    isProductionOperatorAccess(role, email) ||
    isInventoryClerkAccess(role, email)
  ) {
    return false;
  }
  return isPatternOperatorRole(role) || isPatternOperatorEmail(email);
}

export function isInventoryClerkAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined
): boolean {
  if (
    isClientManagerAccess(role, email) ||
    isTaskOperatorAccess(role, email) ||
    isStitchOperatorAccess(role, email) ||
    isProductionOperatorAccess(role, email)
  ) {
    return false;
  }
  return isInventoryClerkRole(role) || isInventoryClerkEmail(email);
}

export function isSalesOperatorAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined
): boolean {
  if (
    isClientManagerAccess(role, email) ||
    isTaskOperatorAccess(role, email) ||
    isStitchOperatorAccess(role, email) ||
    isProductionOperatorAccess(role, email) ||
    isPatternOperatorAccess(role, email) ||
    isInventoryClerkAccess(role, email) ||
    isAccountingOperatorRole(role) ||
    isAccountingOperatorEmail(email)
  ) {
    return false;
  }
  return isSalesOperatorRole(role) || isSalesOperatorEmail(email);
}

export function isAccountingOperatorAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined
): boolean {
  if (
    isClientManagerAccess(role, email) ||
    isTaskOperatorAccess(role, email) ||
    isStitchOperatorAccess(role, email) ||
    isProductionOperatorAccess(role, email) ||
    isPatternOperatorAccess(role, email) ||
    isInventoryClerkAccess(role, email) ||
    isSalesOperatorRole(role) ||
    isSalesOperatorEmail(email)
  ) {
    return false;
  }
  return isAccountingOperatorRole(role) || isAccountingOperatorEmail(email);
}

/** Accounts that must never see prices (QC, task, stitch, factory manager, pattern, sales). */
export function isPriceRestrictedAccess(
  role: UserRole | null | undefined,
  email: string | null | undefined
): boolean {
  return (
    isClientManagerAccess(role, email) ||
    isTaskOperatorAccess(role, email) ||
    isStitchOperatorAccess(role, email) ||
    isProductionOperatorAccess(role, email) ||
    isPatternOperatorAccess(role, email) ||
    isInventoryClerkAccess(role, email) ||
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
  if (isStitchOperatorAccess(role, email)) return "stitch_operator";
  if (isProductionOperatorAccess(role, email)) return "production_operator";
  if (isPatternOperatorAccess(role, email)) return "pattern_operator";
  if (isInventoryClerkAccess(role, email)) return "inventory_clerk";
  if (isSalesOperatorAccess(role, email)) return "sales_operator";
  if (isAccountingOperatorAccess(role, email)) return "accounting";
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

/** QC ID badges are Expats-only -- block Saudis pages/print/PDF. */
export function isClientManagerSaudiIdBadgesPath(pathname: string): boolean {
  return (
    pathname === "/hr/id-badges/saudis" ||
    pathname.startsWith("/hr/id-badges/saudis/") ||
    pathname === "/api/hr/id-badges/saudis" ||
    pathname.startsWith("/api/hr/id-badges/saudis/")
  );
}

export function isClientManagerRouteAllowed(pathname: string): boolean {
  // Never treat badge allowlist as opening the payroll register or salary APIs.
  if (pathname === "/hr" || pathname.startsWith("/hr/")) {
    if (isClientManagerSaudiIdBadgesPath(pathname)) return false;
    return isHrIdBadgesPath(pathname);
  }
  if (pathname === "/api/hr/payroll-employees" || pathname.startsWith("/api/hr/payroll-employees/")) {
    return false;
  }
  if (isClientManagerSaudiIdBadgesPath(pathname)) return false;
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

/** ID badges under `/hr` - operational identity/QR, not the payroll register. */
export function isHrIdBadgesPath(pathname: string): boolean {
  return pathname === "/hr/id-badges" || pathname.startsWith("/hr/id-badges/");
}

export function isStitchOperatorRouteAllowed(pathname: string): boolean {
  // Never open full QC /orders pages (print, edit, fabric PO).
  if (pathname === "/orders" || pathname.startsWith("/orders/")) {
    return false;
  }
  // Stage advance stays factory-manager only.
  if (
    pathname === "/api/production/stage-scan" ||
    pathname.startsWith("/api/production/stage-scan/")
  ) {
    return false;
  }
  // Sales-order reads only: list + `/api/sales-orders/:id` - no stickers/print/transfers.
  if (pathname.startsWith("/api/sales-orders/")) {
    const rest = pathname.slice("/api/sales-orders/".length);
    if (!rest || rest.includes("/")) return false;
  }
  // Work-order reads only: list + `/api/production/work-orders/:id` (PATCH gated in handler).
  if (pathname.startsWith("/api/production/work-orders/")) {
    const rest = pathname.slice("/api/production/work-orders/".length);
    if (!rest || rest.includes("/")) return false;
  }
  return STITCH_OPERATOR_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
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

export function isInventoryClerkRouteAllowed(pathname: string): boolean {
  return INVENTORY_CLERK_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isPatternOperatorRouteAllowed(pathname: string): boolean {
  // Never open full QC /orders pages (print, edit, fabric PO).
  if (pathname === "/orders" || pathname.startsWith("/orders/")) {
    return false;
  }
  // Stage advance stays factory-manager only.
  if (
    pathname === "/api/production/stage-scan" ||
    pathname.startsWith("/api/production/stage-scan/")
  ) {
    return false;
  }
  // Sales-order reads only: list + `/api/sales-orders/:id` - no stickers/print/transfers.
  if (pathname.startsWith("/api/sales-orders/")) {
    const rest = pathname.slice("/api/sales-orders/".length);
    if (!rest || rest.includes("/")) return false;
  }
  // Work-order reads only: list + `/api/production/work-orders/:id` (PATCH gated in handler).
  if (pathname.startsWith("/api/production/work-orders/")) {
    const rest = pathname.slice("/api/production/work-orders/".length);
    if (!rest || rest.includes("/")) return false;
  }
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

export function isAccountingOperatorRouteAllowed(pathname: string): boolean {
  if (
    ACCOUNTING_OPERATOR_BLOCKED_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    return false;
  }
  if (
    pathname.startsWith("/orders/") &&
    (pathname.includes("/print") || pathname.includes("/print-pack") || pathname.includes("/stickers"))
  ) {
    return false;
  }
  if (
    pathname.startsWith("/api/sales-orders/") &&
    (pathname.includes("/stickers") ||
      pathname.includes("/fabric-lines/print") ||
      pathname.includes("/fabric-lines/clear-print-timestamps") ||
      pathname.includes("/fabric-lines/transfer"))
  ) {
    return false;
  }
  return ACCOUNTING_OPERATOR_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isRestrictedRouteAllowed(
  pathname: string,
  access: RestrictedAccessKind
): boolean {
  if (access === "client_manager") return isClientManagerRouteAllowed(pathname);
  if (access === "task_operator") return isTaskOperatorRouteAllowed(pathname);
  if (access === "stitch_operator") return isStitchOperatorRouteAllowed(pathname);
  if (access === "production_operator") return isProductionOperatorRouteAllowed(pathname);
  if (access === "pattern_operator") return isPatternOperatorRouteAllowed(pathname);
  if (access === "inventory_clerk") return isInventoryClerkRouteAllowed(pathname);
  if (access === "accounting") return isAccountingOperatorRouteAllowed(pathname);
  return isSalesOperatorRouteAllowed(pathname);
}

export type SessionLandingAccess = {
  isClientManager?: boolean;
  isTaskOperator?: boolean;
  isStitchOperator?: boolean;
  isProductionOperator?: boolean;
  isPatternOperator?: boolean;
  isInventoryClerk?: boolean;
  isSalesOperator?: boolean;
  isAccountingOperator?: boolean;
};

export function landingAccessFromRestricted(
  restrictedAccess: RestrictedAccessKind | null
): SessionLandingAccess {
  return {
    isClientManager: restrictedAccess === "client_manager",
    isTaskOperator: restrictedAccess === "task_operator",
    isStitchOperator: restrictedAccess === "stitch_operator",
    isProductionOperator: restrictedAccess === "production_operator",
    isPatternOperator: restrictedAccess === "pattern_operator",
    isInventoryClerk: restrictedAccess === "inventory_clerk",
    isSalesOperator: restrictedAccess === "sales_operator",
    isAccountingOperator: restrictedAccess === "accounting",
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
  const isStitchOperator =
    typeof access === "boolean" ? false : Boolean(access.isStitchOperator);
  const isProductionOperator =
    typeof access === "boolean" ? false : Boolean(access.isProductionOperator);
  const isPatternOperator =
    typeof access === "boolean" ? false : Boolean(access.isPatternOperator);
  const isInventoryClerk =
    typeof access === "boolean" ? false : Boolean(access.isInventoryClerk);
  const isSalesOperator =
    typeof access === "boolean" ? false : Boolean(access.isSalesOperator);
  const isAccountingOperator =
    typeof access === "boolean" ? false : Boolean(access.isAccountingOperator);
  // Stitch kiosk and production before sales: floor logins never land on Sales Home.
  if (isStitchOperator) return "/stitch";
  if (isProductionOperator) return "/production";
  if (isPatternOperator) return "/pattern";
  if (isInventoryClerk) return "/inventory";
  if (isSalesOperator) return "/sales";
  if (isAccountingOperator) return "/invoices";
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

/** Sales, QC, factory manager, pattern, and admins - view / upload client photos & videos. */
export function canAccessClientMedia(access: {
  isAdmin?: boolean;
  isSalesOperator?: boolean;
  isClientManager?: boolean;
  isProductionOperator?: boolean;
  isPatternOperator?: boolean;
}): boolean {
  return Boolean(
    access.isAdmin ||
      access.isSalesOperator ||
      access.isClientManager ||
      access.isProductionOperator ||
      access.isPatternOperator
  );
}

/** Pattern (and admin) link wearing photos to a fabric line / article on an SO. */
export function canAssignClientPhotoToFabric(access: {
  isAdmin?: boolean;
  isPatternOperator?: boolean;
}): boolean {
  return Boolean(access.isAdmin || access.isPatternOperator);
}

/** Only admin / super_admin may hard-delete or approve/reject delete requests. */
export function canHardDeleteClientMedia(access: { isAdmin?: boolean }): boolean {
  return Boolean(access.isAdmin);
}

export function isClientPhotoDeletePending(photo: {
  delete_requested_at?: string | null;
}): boolean {
  return Boolean(photo.delete_requested_at);
}
