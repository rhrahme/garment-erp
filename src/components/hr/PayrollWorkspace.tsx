"use client";

import { useMemo, useState } from "react";
import { Building2, Search, Users, Wallet } from "lucide-react";
import { StatCard } from "@/components/ui/PageHeader";
import { maskAccountNumber, sortPayrollEmployees } from "@/lib/hr/payroll-utils";
import type { PayrollEmployee, PayrollSummary } from "@/lib/types/hr-payroll";
import { formatCurrency, formatDate } from "@/lib/utils";

function formatSar(amount: number): string {
  return formatCurrency(amount, "SAR");
}

export function PayrollWorkspace({
  employees,
  summary,
  sourceFile,
  updatedAt,
}: {
  employees: PayrollEmployee[];
  summary: PayrollSummary;
  sourceFile: string;
  updatedAt: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const rows = sortPayrollEmployees(employees.filter((employee) => employee.is_active));
    if (!query) return rows;
    return rows.filter((employee) =>
      [
        employee.full_name,
        employee.employee_id_number,
        employee.bank_name,
        employee.account_number,
        employee.payment_description,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [employees, searchQuery]);

  const filteredTotal = filtered.reduce((sum, employee) => sum + employee.salary_amount, 0);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-950">
        <p className="font-medium">Payroll register imported</p>
        <p className="mt-1 text-emerald-900">
          Loaded from <span className="font-mono text-xs">{sourceFile || "salary spreadsheet"}</span>
          {updatedAt ? ` · updated ${formatDate(updatedAt.slice(0, 10))}` : ""}. Re-import after editing the Excel
          file with{" "}
          <span className="font-mono text-xs">python3 scripts/import-salary-xlsx.py</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Employees"
          value={summary.active_count}
          subtext={`${summary.employee_count} on register`}
          icon={<Users className="h-5 w-5" />}
          accent="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Monthly payroll"
          value={formatSar(summary.total_payroll_sar)}
          subtext="Total salary amount"
          icon={<Wallet className="h-5 w-5" />}
          accent="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="Average salary"
          value={formatSar(summary.average_salary_sar)}
          subtext="Per active employee"
          accent="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Banks"
          value={summary.bank_count}
          subtext={
            summary.total_deductions_sar > 0
              ? `${formatSar(summary.total_deductions_sar)} deductions`
              : "No deductions this month"
          }
          icon={<Building2 className="h-5 w-5" />}
          accent="bg-sky-50 text-sky-600"
        />
      </div>

      <label className="relative block max-w-md text-sm">
        <span className="font-medium text-slate-700">Search employees</span>
        <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-slate-400" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Name, ID, bank, account…"
          className="mt-1 block w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3"
        />
      </label>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          No employees match your search.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">ID No.</th>
                <th className="px-4 py-3">Bank</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Basic</th>
                <th className="px-4 py-3">Housing</th>
                <th className="px-4 py-3">Other</th>
                <th className="px-4 py-3">Deduction</th>
                <th className="px-4 py-3">Net salary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((employee) => (
                <tr key={employee.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-slate-500">{employee.s_no}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{employee.full_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{employee.employee_id_number}</td>
                  <td className="px-4 py-3 text-slate-600">{employee.bank_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500" title={employee.account_number}>
                    {maskAccountNumber(employee.account_number)}
                  </td>
                  <td className="px-4 py-3">{formatSar(employee.basic_salary)}</td>
                  <td className="px-4 py-3">{formatSar(employee.housing_allowance)}</td>
                  <td className="px-4 py-3">{formatSar(employee.other_earnings)}</td>
                  <td className="px-4 py-3">
                    {employee.deduction > 0 ? (
                      <span className="text-red-600">{formatSar(employee.deduction)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{formatSar(employee.salary_amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                <td className="px-4 py-3" colSpan={9}>
                  {filtered.length} employee{filtered.length !== 1 ? "s" : ""} shown
                </td>
                <td className="px-4 py-3">{formatSar(filteredTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
