"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EntityPhotos } from "@/components/entity-images/EntityPhotos";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";
import type { PayrollAdjustment } from "@/lib/types/payroll-adjustments";
import { formatCurrency } from "@/lib/utils";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PayrollAdjustmentsWorkspace({
  employees,
  adjustments,
}: {
  employees: PayrollEmployee[];
  adjustments: PayrollAdjustment[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"overtime" | "deduction">("overtime");
  const [employeeId, setEmployeeId] = useState("");
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameById = useMemo(
    () => new Map(employees.map((row) => [row.id, row.full_name])),
    [employees]
  );

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    const active = employees.filter((row) => row.is_active);
    if (!q) return active.slice(0, 80);
    return active
      .filter(
        (row) =>
          row.full_name.toLowerCase().includes(q) ||
          row.employee_id_number.toLowerCase().includes(q)
      )
      .slice(0, 80);
  }, [employees, search]);

  const newestFirst = useMemo(
    () => [...adjustments].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [adjustments]
  );

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/hr/payroll-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          kind,
          amount,
          hours: hours.trim() === "" ? null : hours,
          note,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save.");
      setAmount("");
      setHours("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this line?")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/hr/payroll-adjustments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not delete.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-800">
          {kind === "overtime" ? "Add overtime" : "Deduct a mistake"}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Overtime here is pay in SAR, not the stitch 10pm scan confirm on the dashboard.
          A mistake needs a note and amount. Add a photo after you save if you have one.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setKind("overtime")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              kind === "overtime"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Overtime
          </button>
          <button
            type="button"
            onClick={() => setKind("deduction")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              kind === "deduction"
                ? "bg-red-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Mistake deduction
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-500">
            Find employee
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or badge number"
              className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
            />
          </label>
          <label className="block text-xs text-slate-500">
            Employee
            <select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
            >
              <option value="">Select...</option>
              {filteredEmployees.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.full_name} ({row.employee_id_number})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-500">
            Amount (SAR)
            <input
              type="number"
              min="0"
              step="0.5"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="e.g. 150"
              className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
            />
          </label>
          {kind === "overtime" ? (
            <label className="block text-xs text-slate-500">
              Hours (optional)
              <input
                type="number"
                min="0"
                step="0.25"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                placeholder="e.g. 2"
                className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
              />
            </label>
          ) : null}
          <label className="block text-xs text-slate-500 sm:col-span-2">
            {kind === "deduction" ? "What was the mistake" : "Note (optional)"}
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                kind === "deduction" ? "e.g. Cut the wrong fabric" : "Optional"
              }
              className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
            />
          </label>
        </div>
        {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
        <button
          type="button"
          disabled={busy || !employeeId || !amount}
          onClick={() => void submit()}
          className="mt-3 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {kind === "overtime" ? "Add overtime" : "Add deduction"}
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">This month's lines</h2>
        </div>
        {newestFirst.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Nothing added yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {newestFirst.map((row) => (
              <li key={row.id} className="px-5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {nameById.get(row.employee_id) ?? row.employee_id}
                    </p>
                    <p className="text-xs text-slate-500">
                      {row.kind === "overtime" ? "Overtime" : "Mistake"}
                      {" - "}
                      {row.kind === "overtime" ? "+" : "-"}
                      {formatCurrency(row.amount, "SAR")}
                      {row.hours != null ? ` (${row.hours} h)` : ""}
                      {" - "}
                      {formatWhen(row.created_at)}
                    </p>
                    {row.note ? (
                      <p className="mt-1 text-sm text-slate-700">{row.note}</p>
                    ) : null}
                    <EntityPhotos payrollAdjustmentId={row.id} compact className="mt-2" />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(row.id)}
                    className="text-xs font-medium text-slate-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
