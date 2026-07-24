"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckSquare, Printer, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { badgePrintHref } from "@/lib/hr/badge-print";
import type { IdBadgeGroup } from "@/lib/hr/payroll-utils";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

export function EmployeeBadgePrintControls({
  employees,
  group,
}: {
  employees: PayrollEmployee[];
  group: IdBadgeGroup;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const allIds = useMemo(() => employees.map((employee) => employee.id), [employees]);
  const selectedCount = selectedIds.size;
  const allSelected = employees.length > 0 && selectedCount === employees.length;

  function toggleSelectMode() {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(allIds));
  }

  const printAllHref = badgePrintHref(group);
  const printSelectedHref = badgePrintHref(group, [...selectedIds]);

  if (employees.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">Print A4 cards</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Card-size badges with cutting marks · print all or choose who to include
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={toggleSelectMode}
            className="gap-1.5"
          >
            {selectMode ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            {selectMode ? "Cancel selection" : "Choose employees"}
          </Button>
          {selectMode ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
                {allSelected ? "Clear all" : "Select all"}
              </Button>
              <Link
                href={printSelectedHref}
                target="_blank"
                rel="noreferrer"
                className={selectedCount === 0 ? "pointer-events-none opacity-50" : undefined}
                aria-disabled={selectedCount === 0}
              >
                <Button
                  type="button"
                  size="sm"
                  disabled={selectedCount === 0}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500"
                >
                  <Printer className="h-4 w-4" />
                  Print selected ({selectedCount})
                </Button>
              </Link>
            </>
          ) : (
            <Link href={printAllHref} target="_blank" rel="noreferrer">
              <Button
                type="button"
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500"
              >
                <Printer className="h-4 w-4" />
                Print all ({employees.length})
              </Button>
            </Link>
          )}
        </div>
      </div>

      {selectMode ? (
        <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-2">
          {employees.map((employee) => {
            const checked = selectedIds.has(employee.id);
            return (
              <li key={employee.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(employee.id)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                    {employee.full_name}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-slate-500">
                    {employee.employee_id_number}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
