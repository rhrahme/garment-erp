"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  EMPLOYEE_JOB_FUNCTION_LABELS,
  EMPLOYEE_JOB_FUNCTIONS,
  formatJobFunctionsSummary,
  normalizeJobFunctions,
  type EmployeeJobFunction,
} from "@/lib/hr/job-functions";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";

async function patchJobFunctions(
  url: string,
  jobFunctions: EmployeeJobFunction[]
): Promise<PayrollEmployee> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job_functions: jobFunctions }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Save failed");
  return data.employee as PayrollEmployee;
}

export function JobFunctionsEditor({
  employee,
  onUpdated,
  patchUrl,
}: {
  employee: PayrollEmployee;
  onUpdated: (employee: PayrollEmployee) => void;
  /** Defaults to admin payroll PATCH. QC badges use the narrow employees job-functions route. */
  patchUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(
    () => normalizeJobFunctions(employee.job_functions),
    [employee.job_functions]
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const url =
    patchUrl ??
    `/api/hr/payroll-employees/${encodeURIComponent(employee.id)}`;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function toggle(fn: EmployeeJobFunction) {
    const next = selectedSet.has(fn)
      ? selected.filter((value) => value !== fn)
      : [...selected, fn];
    setSaving(true);
    setError(null);
    try {
      const updated = await patchJobFunctions(url, normalizeJobFunctions(next));
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-[11rem]">
      <button
        type="button"
        disabled={saving}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-xs text-slate-800 hover:border-slate-400 disabled:opacity-60"
      >
        <span className="truncate">{formatJobFunctionsSummary(selected)}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {EMPLOYEE_JOB_FUNCTIONS.map((fn) => {
            const checked = selectedSet.has(fn);
            return (
              <label
                key={fn}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={saving}
                  onChange={() => void toggle(fn)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span>{EMPLOYEE_JOB_FUNCTION_LABELS[fn]}</span>
              </label>
            );
          })}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
