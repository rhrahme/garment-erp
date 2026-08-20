import {
  employeeActivityQrSides,
  employeeAlterationQrPayload,
  employeeQrPayload,
  employeeUsesButtonsBadgePair,
  employeeUsesIronButtonsBadgePair,
  employeeUsesWashIronBadgePair,
} from "@/lib/hr/employee-qr";
import {
  EMPLOYEE_JOB_FUNCTION_LABELS,
  isTailorJobFunction,
  normalizeJobFunctions,
} from "@/lib/hr/job-functions";
import {
  filterPayrollEmployeesByGroup,
  sortPayrollEmployees,
  type IdBadgeGroup,
} from "@/lib/hr/payroll-utils";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

/** Name printed on ID badge cards - short_name when set, else legal full_name. */
export function badgeDisplayName(
  employee: Pick<PayrollEmployee, "full_name" | "short_name">
): string {
  const short = String(employee.short_name ?? "").trim();
  return short || employee.full_name;
}

/**
 * Job role labels for the physical/PDF badge card (catalog order).
 * Empty when none are set - callers should hide the jobs block.
 */
export function badgeJobFunctionLabels(
  employee: Pick<PayrollEmployee, "job_functions">
): string[] {
  return normalizeJobFunctions(employee.job_functions).map(
    (fn) => EMPLOYEE_JOB_FUNCTION_LABELS[fn]
  );
}

/** Compact single-line job summary for the badge; null when none. */
export function badgeJobFunctionsLine(
  employee: Pick<PayrollEmployee, "job_functions">
): string | null {
  const labels = badgeJobFunctionLabels(employee);
  if (labels.length === 0) return null;
  return labels.join(", ");
}

/**
 * Version stamp for physical/PDF badge cards - calendar day when printed.
 * Uses Asia/Riyadh and the same en-GB day style as HR `formatDate`.
 */
export function badgePrintDateLabel(now = new Date()): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Riyadh",
  }).format(now);
  return `Printed ${formatted}`;
}

/** Standard CR80 / ID-1 badge size (mm). */
export const BADGE_CARD_WIDTH_MM = 85.6;
export const BADGE_CARD_HEIGHT_MM = 54;

/**
 * Badge QRs: one code per selected floor job (washing, ironing, buttons,
 * button stitch, buttonhole, champa, bartek). Tailors also get Sew (EMP) +
 * Alteration (EMPALT). Two-code cards keep a 3cm gap; more codes shrink to fit.
 */
export const BADGE_QR_DISPLAY_MM = 20;
export const BADGE_QR_GAP_MM = 30;
export const BADGE_QR_FETCH_PX = 240;
export const BADGE_QR_USABLE_WIDTH_MM = 78;
export const BADGE_QR_SEW_LABEL = "SEWING";
export const BADGE_QR_ALT_LABEL = "ALTERATION";
export const BADGE_QR_IRON_LABEL = "IRONING";
export const BADGE_QR_BUTTONS_LABEL = "BUTTONS";
export const BADGE_QR_WASH_LABEL = "WASHING";
/** Pair width = QR + 3cm gap + QR (centered on the card). */
export const BADGE_QR_PAIR_WIDTH_MM =
  BADGE_QR_DISPLAY_MM + BADGE_QR_GAP_MM + BADGE_QR_DISPLAY_MM;

export type BadgeQrPairKind = "sew_alt" | "iron_buttons" | "wash_iron" | "buttons" | "activity";

export type BadgeQrSideKind = "sew" | "alteration" | "activity";

export type BadgeQrSide = {
  kind: BadgeQrSideKind;
  label: string;
  payload: string;
};

export type BadgeQrPairSides = {
  kind: BadgeQrPairKind;
  leftLabel: string;
  rightLabel: string;
  leftPayload: string;
  rightPayload: string;
};

export type BadgeQrRowLayout = {
  count: number;
  sizeMm: number;
  gapMm: number;
  rowWidthMm: number;
};

/**
 * Max QRs on one CR80. 3 stay 20mm; 4 shrink to 17mm. Five or more
 * overflow the scan row, so print another card.
 */
export const BADGE_QR_MAX_PER_CARD = 4;

export type BadgePrintCard = {
  employee: PayrollEmployee;
  sides: BadgeQrSide[];
  cardIndex: number;
  cardCount: number;
};

function isIronOrButtonsSide(side: BadgeQrSide): boolean {
  return side.label === BADGE_QR_IRON_LABEL || side.label === BADGE_QR_BUTTONS_LABEL;
}

function isWashingSide(side: BadgeQrSide): boolean {
  return side.label === BADGE_QR_WASH_LABEL;
}

/**
 * Split overflow QRs across cards so each row stays scannable.
 * Iron + buttons stay on card 1 (Cherry's finishing pair); washing
 * joins them when it still fits. Remaining floor jobs go on card 2.
 */
export function splitBadgeQrSides(sides: BadgeQrSide[]): BadgeQrSide[][] {
  if (sides.length === 0) return [[]];
  if (sides.length <= BADGE_QR_MAX_PER_CARD) return [sides];

  const ironButtons = sides.filter(isIronOrButtonsSide);
  const washing = sides.filter(isWashingSide);
  if (ironButtons.length === 2) {
    const card1 = [...ironButtons, ...washing].slice(0, BADGE_QR_MAX_PER_CARD);
    const used = new Set(card1);
    const card2 = sides.filter((side) => !used.has(side));
    if (card2.length > 0 && card2.length <= BADGE_QR_MAX_PER_CARD) {
      return [card1, card2];
    }
  }

  const chunks: BadgeQrSide[][] = [];
  for (let i = 0; i < sides.length; i += BADGE_QR_MAX_PER_CARD) {
    chunks.push(sides.slice(i, i + BADGE_QR_MAX_PER_CARD));
  }
  const first = chunks[0];
  const last = chunks[chunks.length - 1];
  if (chunks.length >= 2 && first && last && last.length === 1 && first.length === 4) {
    last.unshift(first.pop()!);
  }
  return chunks;
}

export function expandBadgePrintCards(employees: PayrollEmployee[]): BadgePrintCard[] {
  const cards: BadgePrintCard[] = [];
  for (const employee of employees) {
    const groups = splitBadgeQrSides(badgeQrSides(employee));
    const cardCount = Math.max(1, groups.length);
    groups.forEach((groupSides, index) => {
      cards.push({
        employee,
        sides: groupSides,
        cardIndex: index + 1,
        cardCount,
      });
    });
  }
  return cards;
}

/** Jobs line for one printed card (only the QRs on that card). */
export function badgeCardJobsLine(sides: BadgeQrSide[]): string | null {
  if (sides.length === 0) return null;
  return sides
    .map((side) => {
      if (side.kind === "sew") return "Sewing";
      if (side.kind === "alteration") return "Alteration";
      return side.label
        .toLowerCase()
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    })
    .join(", ");
}

export function badgeCardIndexLabel(cardIndex: number, cardCount: number): string | null {
  if (cardCount <= 1) return null;
  return `Card ${cardIndex} of ${cardCount}`;
}

/** Size and gap for a one-row QR strip on a CR80 card. */
export function badgeQrRowLayout(count: number): BadgeQrRowLayout {
  const n = Math.max(1, count);
  if (n === 1) {
    return { count: n, sizeMm: BADGE_QR_DISPLAY_MM, gapMm: 0, rowWidthMm: BADGE_QR_DISPLAY_MM };
  }
  if (n === 2) {
    return {
      count: n,
      sizeMm: BADGE_QR_DISPLAY_MM,
      gapMm: BADGE_QR_GAP_MM,
      rowWidthMm: BADGE_QR_PAIR_WIDTH_MM,
    };
  }
  const minGap = 3;
  const size = Math.min(
    BADGE_QR_DISPLAY_MM,
    Math.floor((BADGE_QR_USABLE_WIDTH_MM - (n - 1) * minGap) / n)
  );
  const gap = (BADGE_QR_USABLE_WIDTH_MM - size * n) / (n - 1);
  return { count: n, sizeMm: size, gapMm: gap, rowWidthMm: BADGE_QR_USABLE_WIDTH_MM };
}

/** Which dual-QR pair to print for this employee. */
export function badgeQrPairKind(
  employee: Pick<PayrollEmployee, "job_functions">
): BadgeQrPairKind {
  const sides = badgeQrSides(employee);
  if (sides.length > 2) return "activity";
  if (employeeUsesIronButtonsBadgePair(employee)) return "iron_buttons";
  if (employeeUsesWashIronBadgePair(employee)) return "wash_iron";
  if (employeeUsesButtonsBadgePair(employee)) return "buttons";
  return "sew_alt";
}

/** One QR per selected floor job; tailors also get Sew + Alteration. */
export function badgeQrSides(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number" | "job_functions">
): BadgeQrSide[] {
  const jobs = normalizeJobFunctions(employee.job_functions);
  const isTailor = jobs.some(isTailorJobFunction);
  const activity = employeeActivityQrSides(employee);
  const sides: BadgeQrSide[] = [];
  if (isTailor || activity.length === 0) {
    sides.push({
      kind: "sew",
      label: BADGE_QR_SEW_LABEL,
      payload: employeeQrPayload(employee),
    });
    sides.push({
      kind: "alteration",
      label: BADGE_QR_ALT_LABEL,
      payload: employeeAlterationQrPayload(employee),
    });
  }
  for (const row of activity) {
    sides.push({
      kind: "activity",
      label: row.label,
      payload: row.payload,
    });
  }
  return sides;
}

/** Labels + payloads for the physical/PDF/screen badge pair (first two sides). */
export function badgeQrPairSides(
  employee: Pick<PayrollEmployee, "id" | "employee_id_number" | "job_functions">
): BadgeQrPairSides {
  const kind = badgeQrPairKind(employee);
  const sides = badgeQrSides(employee);
  const left = sides[0]!;
  const right = sides[1] ?? left;
  return {
    kind,
    leftLabel: left.label,
    rightLabel: right.label,
    leftPayload: left.payload,
    rightPayload: right.payload,
  };
}

/** A4 portrait grid: 2 x 5 = 10 cards per sheet. */
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

/** PDF download endpoint for A4 badge sheets (same selection as print). */
export function badgePdfHref(
  group: IdBadgeGroup,
  employeeIds?: readonly string[]
): string {
  const base = `/api/hr/id-badges/${badgeSlugFromGroup(group)}/pdf`;
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

/**
 * Active employees only (already scoped to a badge group by the caller).
 * Use this when `bank_name` was stripped via `toBadgeSafeEmployee` - re-running
 * bank-based Saudi/Expat classification would drop every Expat (empty bank => Saudi).
 */
export function listActiveBadgeEmployees(employees: PayrollEmployee[]): PayrollEmployee[] {
  return sortPayrollEmployees(employees.filter(isBadgePrintableEmployee));
}

export function listBadgePrintableEmployees(
  employees: PayrollEmployee[],
  group: IdBadgeGroup
): PayrollEmployee[] {
  // Group filter must run on full payroll (with bank_name) before any badge-safe strip.
  return listActiveBadgeEmployees(filterPayrollEmployeesByGroup(employees, group));
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
