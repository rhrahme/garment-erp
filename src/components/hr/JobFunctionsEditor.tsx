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

type Step = "assign" | "confirm";

function sameJobFunctions(a: EmployeeJobFunction[], b: EmployeeJobFunction[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

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
  const [step, setStep] = useState<Step>("assign");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const confirmed = useMemo(
    () => normalizeJobFunctions(employee.job_functions),
    [employee.job_functions]
  );
  const [draft, setDraft] = useState<EmployeeJobFunction[]>(confirmed);
  const draftSet = useMemo(() => new Set(draft), [draft]);
  const dirty = !sameJobFunctions(draft, confirmed);
  const url =
    patchUrl ??
    `/api/hr/payroll-employees/${encodeURIComponent(employee.id)}`;

  // Keep draft aligned with saved roles when there are no local edits.
  useEffect(() => {
    if (!dirty) setDraft(confirmed);
  }, [confirmed, dirty]);

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

  function openPanel() {
    setDraft(confirmed);
    setStep("assign");
    setError(null);
    setOpen((current) => !current);
  }

  function toggleDraft(fn: EmployeeJobFunction) {
    setError(null);
    setDraft((current) => {
      const next = current.includes(fn)
        ? current.filter((value) => value !== fn)
        : [...current, fn];
      return normalizeJobFunctions(next);
    });
  }

  function discardDraft() {
    setDraft(confirmed);
    setError(null);
    setStep("assign");
  }

  async function confirmAssignment() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await patchJobFunctions(url, normalizeJobFunctions(draft));
      onUpdated(updated);
      setOpen(false);
      setStep("assign");
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
        aria-haspopup="dialog"
        onClick={openPanel}
        className="flex w-full items-center justify-between gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-xs text-slate-800 hover:border-slate-400 disabled:opacity-60"
      >
        <span className="truncate">{formatJobFunctionsSummary(confirmed)}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 ${open ? "rotate-180" : ""}`} />
      </button>

      {confirmed.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {confirmed.map((fn) => (
            <span
              key={fn}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
            >
              {EMPLOYEE_JOB_FUNCTION_LABELS[fn]}
            </span>
          ))}
        </div>
      ) : null}

      {open && (
        <div
          role="dialog"
          aria-label="Assign job tasks"
          className="absolute left-0 z-20 mt-1 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          <div className="grid grid-cols-2 border-b border-slate-200" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={step === "assign"}
              onClick={() => setStep("assign")}
              className={`px-3 py-2.5 text-xs font-medium ${
                step === "assign"
                  ? "border-b-2 border-[#0B2C5A] text-[#0B2C5A]"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Assign
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={step === "confirm"}
              onClick={() => setStep("confirm")}
              className={`px-3 py-2.5 text-xs font-medium ${
                step === "confirm"
                  ? "border-b-2 border-[#0B2C5A] text-[#0B2C5A]"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Confirm{dirty ? " *" : ""}
            </button>
          </div>

          {step === "assign" ? (
            <div role="tabpanel" className="max-h-64 overflow-y-auto py-1">
              {EMPLOYEE_JOB_FUNCTIONS.map((fn) => {
                const checked = draftSet.has(fn);
                return (
                  <label
                    key={fn}
                    className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={saving}
                      onChange={() => toggleDraft(fn)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span>{EMPLOYEE_JOB_FUNCTION_LABELS[fn]}</span>
                  </label>
                );
              })}
              <div className="border-t border-slate-100 p-2">
                <button
                  type="button"
                  onClick={() => setStep("confirm")}
                  className="w-full rounded-md bg-[#0B2C5A] px-3 py-2.5 text-xs font-medium text-white hover:bg-[#0B2C5A]/90"
                >
                  Review & confirm
                </button>
              </div>
            </div>
          ) : (
            <div role="tabpanel" className="space-y-3 p-3">
              <p className="text-xs text-slate-600">
                {dirty
                  ? "Review the roles below, then confirm to save."
                  : "No changes. Adjust roles on Assign, or close."}
              </p>
              {draft.length === 0 ? (
                <p className="rounded-md bg-amber-50 px-2 py-2 text-xs text-amber-800">
                  No roles selected. Confirming will clear all job tasks.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {draft.map((fn) => (
                    <span
                      key={fn}
                      className="rounded-full bg-[#0B2C5A]/10 px-2.5 py-1 text-xs font-medium text-[#0B2C5A]"
                    >
                      {EMPLOYEE_JOB_FUNCTION_LABELS[fn]}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving || !dirty}
                  onClick={() => void confirmAssignment()}
                  className="flex-1 rounded-md bg-[#0B2C5A] px-3 py-2.5 text-xs font-medium text-white hover:bg-[#0B2C5A]/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Confirm"}
                </button>
                <button
                  type="button"
                  disabled={saving || !dirty}
                  onClick={discardDraft}
                  className="rounded-md border border-slate-300 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
          {error && <p className="border-t border-slate-100 px-3 py-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
