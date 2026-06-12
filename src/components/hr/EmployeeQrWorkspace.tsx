"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { employeeQrPayload } from "@/lib/hr/employee-qr";
import { sortPayrollEmployees } from "@/lib/hr/payroll-utils";
import { qrImageUrl } from "@/lib/production/qr-labels";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

const QR_SIZE = 120;

export function EmployeeQrWorkspace({ employees }: { employees: PayrollEmployee[] }) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const rows = sortPayrollEmployees(employees.filter((employee) => employee.is_active));
    if (!query) return rows;
    return rows.filter((employee) =>
      [employee.full_name, employee.employee_id_number, employee.id].join(" ").toLowerCase().includes(query)
    );
  }, [employees, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-950">
        <p className="font-medium">Employee ID badges</p>
        <p className="mt-1 text-emerald-900">
          Each QR encodes a unique employee identifier for attendance, access control, or floor scanning. Active
          employees only — same list as the payroll register.
        </p>
      </div>

      <label className="relative block max-w-md text-sm">
        <span className="font-medium text-slate-700">Search employees</span>
        <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-slate-400" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Name or ID number…"
          className="mt-1 block w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3"
        />
      </label>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          No employees match your search.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((employee) => {
            const payload = employeeQrPayload(employee);
            const qrSrc = qrImageUrl(payload, QR_SIZE);

            return (
              <div
                key={employee.id}
                className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm"
              >
                <p className="font-medium text-slate-900">{employee.full_name}</p>
                <p className="mt-1 font-mono text-xs text-slate-600">{employee.employee_id_number}</p>
                <div className="mt-3 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrSrc}
                    alt={`QR code for ${employee.full_name}`}
                    width={QR_SIZE}
                    height={QR_SIZE}
                    className="rounded-lg border border-slate-200"
                  />
                </div>
                <p className="mt-2 font-mono text-[10px] text-slate-400">{payload}</p>
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
