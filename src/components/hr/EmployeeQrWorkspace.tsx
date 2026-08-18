"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CreateEmployeeForm } from "@/components/hr/CreateEmployeeForm";
import { EmployeeBadgePrintControls } from "@/components/hr/EmployeeBadgePrintControls";
import { JobFunctionsEditor } from "@/components/hr/JobFunctionsEditor";
import { ShortNameEditor } from "@/components/hr/ShortNameEditor";
import {
  BADGE_QR_ALT_LABEL,
  BADGE_QR_BUTTONS_LABEL,
  BADGE_QR_IRON_LABEL,
  BADGE_QR_SEW_LABEL,
  badgeDisplayName,
  badgeQrPairKind,
  listActiveBadgeEmployees,
} from "@/lib/hr/badge-print";
import {
  employeeAlterationQrPayload,
  employeeButtonsQrPayload,
  employeeIroningQrPayload,
  employeeQrPayload,
} from "@/lib/hr/employee-qr";
import { type IdBadgeGroup } from "@/lib/hr/payroll-utils";
import { qrImageUrl } from "@/lib/production/qr-labels";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

const QR_SIZE = 96;

/** Highlight employees added within the last 30 days as "New". */
const NEW_EMPLOYEE_WINDOW_MS = 30 * 24 * 3600_000;

function addedDateLabel(createdAt: string | null | undefined): string | null {
  const ms = Date.parse(createdAt ?? "");
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isNewEmployee(createdAt: string | null | undefined): boolean {
  const ms = Date.parse(createdAt ?? "");
  return Number.isFinite(ms) && Date.now() - ms <= NEW_EMPLOYEE_WINDOW_MS;
}

const GROUP_COPY: Record<
  IdBadgeGroup,
  { title: string; description: string; emptyHint: string }
> = {
  saudi: {
    title: "Saudi employee ID badges",
    description:
      "Saudi badge group. Sew QR (EMP) for normal stitching; Alteration QR (EMPALT) starts alteration work and notifies Pattern to update the chart.",
    emptyHint: "No active Saudi employees yet. Add one below or switch to Expats.",
  },
  expat: {
    title: "Expat employee ID badges",
    description:
      "Expat badge group. Tailors: Sew (EMP) + Alteration (EMPALT). Wash/iron + Buttons workers (e.g. Cherry): Ironing (EMPIRON) + Buttons (EMPBTN) so Live shows the chosen job.",
    emptyHint: "No active Expat employees yet. Add one below.",
  },
};

export function EmployeeQrWorkspace({
  employees: initialEmployees,
  group,
  canCreate = false,
  canEditJobFunctions = false,
  canEditShortName = false,
  expatOnlyCreate = false,
}: {
  employees: PayrollEmployee[];
  group: IdBadgeGroup;
  /** Factory managers and admins can add identity-only employees. */
  canCreate?: boolean;
  /** QC (and admin on badges) can assign multi-select job roles without payroll salary access. */
  canEditJobFunctions?: boolean;
  /** QC (and admin) can set badge nickname without payroll salary access. */
  canEditShortName?: boolean;
  /** QC creates Expats only -- hide Saudis option in the add form. */
  expatOnlyCreate?: boolean;
}) {
  const copy = GROUP_COPY[group];
  const [searchQuery, setSearchQuery] = useState("");
  const [employees, setEmployees] = useState(initialEmployees);

  useEffect(() => {
    setEmployees(initialEmployees);
  }, [initialEmployees]);

  // Pages already filter by Saudi/Expat before stripping bank_name for QC.
  // Do not re-classify by bank here — empty bank would hide every Expat.
  const printable = useMemo(() => listActiveBadgeEmployees(employees), [employees]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return printable;
    return printable.filter((employee) =>
      [
        employee.full_name,
        employee.short_name,
        employee.employee_id_number,
        employee.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [printable, searchQuery]);

  function updateEmployee(updated: PayrollEmployee) {
    setEmployees((current) =>
      current.map((employee) =>
        employee.id === updated.id
          ? {
              ...employee,
              // Narrow badge APIs return safe fields only -- merge, keep local identity.
              job_functions:
                updated.job_functions !== undefined
                  ? updated.job_functions
                  : employee.job_functions,
              short_name:
                updated.short_name !== undefined ? updated.short_name : employee.short_name,
              full_name: updated.full_name || employee.full_name,
              employee_id_number: updated.employee_id_number || employee.employee_id_number,
            }
          : employee
      )
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#0B2C5A]/25 bg-[#0B2C5A]/5 px-5 py-4 text-sm text-slate-950">
        <p className="font-medium text-[#0B2C5A]">{copy.title}</p>
        <p className="mt-1 text-slate-800">{copy.description} Active employees only.</p>
      </div>

      {canCreate ? (
        <CreateEmployeeForm defaultGroup={group} expatOnly={expatOnlyCreate} />
      ) : null}

      <EmployeeBadgePrintControls employees={printable} group={group} />

      <label className="relative block max-w-md text-sm">
        <span className="font-medium text-slate-700">Search employees</span>
        <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-slate-400" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Name or ID number..."
          className="mt-1 block w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3"
        />
      </label>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          {searchQuery.trim() ? "No employees match your search." : copy.emptyHint}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((employee) => {
            const pairKind = badgeQrPairKind(employee);
            const payload =
              pairKind === "iron_buttons"
                ? employeeIroningQrPayload(employee)
                : employeeQrPayload(employee);
            const altPayload =
              pairKind === "iron_buttons"
                ? employeeButtonsQrPayload(employee)
                : employeeAlterationQrPayload(employee);
            const leftLabel =
              pairKind === "iron_buttons" ? BADGE_QR_IRON_LABEL : BADGE_QR_SEW_LABEL;
            const rightLabel =
              pairKind === "iron_buttons" ? BADGE_QR_BUTTONS_LABEL : BADGE_QR_ALT_LABEL;
            const qrSrc = qrImageUrl(payload, QR_SIZE);
            const altQrSrc = qrImageUrl(altPayload, QR_SIZE);

            return (
              <div
                key={employee.id}
                className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm"
              >
                <p className="font-medium text-slate-900">{employee.full_name}</p>
                {employee.short_name?.trim() ? (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Badge: {badgeDisplayName(employee)}
                  </p>
                ) : null}
                <p className="mt-1 font-mono text-xs text-slate-600">{employee.employee_id_number}</p>
                {addedDateLabel(employee.created_at) ? (
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                    Added {addedDateLabel(employee.created_at)}
                    {isNewEmployee(employee.created_at) ? (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                        New
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {canEditShortName ? (
                  <div className="mt-3 w-full">
                    <ShortNameEditor
                      employee={employee}
                      onUpdated={updateEmployee}
                      patchUrl={`/api/hr/employees/${encodeURIComponent(employee.id)}`}
                    />
                  </div>
                ) : null}
                {canEditJobFunctions ? (
                  <div className="mt-3 w-full text-left">
                    <p className="mb-1 text-xs font-medium text-slate-600">Job tasks</p>
                    <JobFunctionsEditor
                      employee={employee}
                      onUpdated={updateEmployee}
                      patchUrl={`/api/hr/employees/${encodeURIComponent(employee.id)}/job-functions`}
                    />
                  </div>
                ) : null}
                <div className="mt-3 flex w-full justify-center gap-3">
                  <div className="flex flex-col items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrSrc}
                      alt={`${leftLabel} QR for ${employee.full_name}`}
                      width={QR_SIZE}
                      height={QR_SIZE}
                      className="rounded-lg border border-slate-200"
                    />
                    <p className="mt-1 text-[10px] font-semibold uppercase text-slate-600">
                      {leftLabel}
                    </p>
                    <p className="font-mono text-[9px] text-slate-400">{payload}</p>
                  </div>
                  <div className="flex flex-col items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={altQrSrc}
                      alt={`${rightLabel} QR for ${employee.full_name}`}
                      width={QR_SIZE}
                      height={QR_SIZE}
                      className="rounded-lg border-2 border-amber-600"
                    />
                    <p className="mt-1 text-[10px] font-bold uppercase text-amber-800">
                      {rightLabel}
                    </p>
                    <p className="font-mono text-[9px] text-slate-400">{altPayload}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filtered.length > 0 ? (
        <p className="text-sm text-slate-500">
          {filtered.length} employee{filtered.length !== 1 ? "s" : ""} shown
        </p>
      ) : null}
    </div>
  );
}
