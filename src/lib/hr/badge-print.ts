import {
  filterPayrollEmployeesByGroup,
  sortPayrollEmployees,
  type IdBadgeGroup,
} from "@/lib/hr/payroll-utils";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

/** Standard CR80 / ID-1 badge size (mm). */
export const BADGE_CARD_WIDTH_MM = 85.6;
export const BADGE_CARD_HEIGHT_MM = 54;

/** A4 portrait grid: 2 × 5 = 10 cards per sheet. */
export const BADGE_CARDS_PER_ROW = 2;
export const BADGE_ROWS_PER_PAGE = 5;
export const BADGE_CARDS_PER_PAGE = BADGE_CARDS_PER_ROW * BADGE_ROWS_PER_PAGE;

export type BadgePrintGroupSlug = "saudis" | "expats";

export function badgeGroupFromSlug(slug: string): IdBadgeGroup | null {
  if (slug === "saudis") return "saudi";
  if (slug === "expats") return "expat";
  return null;
}

export function badgeSlugFromGroup(group: IdBadgeGroup): BadgePrintGroupSlug {
  return group === "expat" ? "expats" : "saudis";
}

export function badgePrintHref(
  group: IdBadgeGroup,
  employeeIds?: readonly string[]
): string {
  const base = `/hr/id-badges/${badgeSlugFromGroup(group)}/print`;
  if (!employeeIds || employeeIds.length === 0) return base;
  const params = new URLSearchParams();
  params.set("ids", employeeIds.join(","));
  return `${base}?${params.toString()}`;
}

/**
 * Employees eligible for ID badge printing.
 * Active only; also skips terminated flags if another agent added them.
 */
export function isBadgePrintableEmployee(
  employee: PayrollEmployee & {
    is_terminated?: boolean;
    terminated_at?: string | null;
    employment_status?: string | null;
  }
): boolean {
  if (!employee.is_active) return false;
  if (employee.is_terminated === true) return false;
  if (employee.terminated_at) return false;
  const status = employee.employment_status?.trim().toLowerCase();
  if (status && ["terminated", "fired", "inactive", "ended"].includes(status)) {
    return false;
  }
  return true;
}

export function listBadgePrintableEmployees(
  employees: PayrollEmployee[],
  group: IdBadgeGroup
): PayrollEmployee[] {
  return sortPayrollEmployees(
    filterPayrollEmployeesByGroup(employees, group).filter(isBadgePrintableEmployee)
  );
}

export function parseBadgePrintIds(raw: string | string[] | undefined): string[] | null {
  if (raw == null) return null;
  const joined = Array.isArray(raw) ? raw.join(",") : raw;
  const ids = joined
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : null;
}

export function selectBadgePrintEmployees(
  employees: PayrollEmployee[],
  group: IdBadgeGroup,
  ids: string[] | null
): PayrollEmployee[] {
  const pool = listBadgePrintableEmployees(employees, group);
  if (!ids) return pool;
  const wanted = new Set(ids);
  return pool.filter(
    (employee) => wanted.has(employee.id) || wanted.has(employee.employee_id_number)
  );
}

export function chunkBadgePages<T>(items: T[], pageSize = BADGE_CARDS_PER_PAGE): T[][] {
  if (items.length === 0) return [];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }
  return pages;
}
