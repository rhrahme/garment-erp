"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { EmployeeBadgeCard } from "@/components/hr/EmployeeBadgeCard";
import { Button } from "@/components/ui/Button";
import {
  BADGE_CARD_HEIGHT_MM,
  BADGE_CARD_WIDTH_MM,
  BADGE_CARDS_PER_PAGE,
  BADGE_CARDS_PER_ROW,
  BADGE_ROWS_PER_PAGE,
  badgeSlugFromGroup,
  chunkBadgePages,
} from "@/lib/hr/badge-print";
import { EMPLOYEE_BADGE_PRINT_CSS } from "@/lib/hr/badge-print-styles";
import type { IdBadgeGroup } from "@/lib/hr/payroll-utils";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

const GROUP_TITLE: Record<IdBadgeGroup, string> = {
  saudi: "Saudi",
  expat: "Expat",
};

export function EmployeeBadgePrintSheet({
  employees,
  group,
}: {
  employees: PayrollEmployee[];
  group: IdBadgeGroup;
}) {
  const pages = chunkBadgePages(employees);
  const backHref = `/hr/id-badges/${badgeSlugFromGroup(group)}`;

  return (
    <div className="employee-badge-print-root min-h-screen bg-white p-6 text-slate-900 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: EMPLOYEE_BADGE_PRINT_CSS }} />

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <Link href={backHref} className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
            ← Back to {GROUP_TITLE[group]} badges
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            A4 · {BADGE_CARDS_PER_ROW}×{BADGE_ROWS_PER_PAGE} cards (
            {BADGE_CARD_WIDTH_MM}×{BADGE_CARD_HEIGHT_MM} mm CR80) · crop marks at corners ·{" "}
            {employees.length} badge{employees.length === 1 ? "" : "s"}
            {pages.length > 1 ? ` · ${pages.length} sheets` : ""}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => window.print()}
          disabled={employees.length === 0}
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500"
        >
          <Printer className="h-4 w-4" />
          Print A4 cards
        </Button>
      </div>

      {employees.length === 0 ? (
        <div className="no-print rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-500">
          No active {GROUP_TITLE[group].toLowerCase()} employees to print.
        </div>
      ) : (
        pages.map((pageEmployees, pageIndex) => (
          <section
            key={`badge-page-${pageIndex}`}
            className="badge-print-page mb-8 print:mb-0"
            aria-label={`Badge sheet ${pageIndex + 1} of ${pages.length}`}
          >
            <div
              className="badge-print-grid mx-auto grid justify-center gap-x-8 gap-y-6"
              style={{
                gridTemplateColumns: `repeat(${BADGE_CARDS_PER_ROW}, ${BADGE_CARD_WIDTH_MM}mm)`,
                gridAutoRows: `${BADGE_CARD_HEIGHT_MM}mm`,
              }}
            >
              {pageEmployees.map((employee) => (
                <EmployeeBadgeCard key={employee.id} employee={employee} group={group} />
              ))}
            </div>
            {pageIndex < pages.length - 1 ? (
              <p className="no-print mt-3 text-center text-xs text-slate-400">
                Page {pageIndex + 1} · {BADGE_CARDS_PER_PAGE} max per A4
              </p>
            ) : null}
          </section>
        ))
      )}
    </div>
  );
}
