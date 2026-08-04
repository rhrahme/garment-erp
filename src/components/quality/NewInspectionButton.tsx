"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export type WorkOrderOption = {
  id: string;
  label: string;
};

const RESULT_OPTIONS = [
  { id: "pass", label: "Pass", activeClass: "bg-emerald-600 text-white" },
  { id: "rework", label: "Rework", activeClass: "bg-amber-500 text-white" },
  { id: "fail", label: "Fail", activeClass: "bg-red-600 text-white" },
] as const;

type InspectionResult = (typeof RESULT_OPTIONS)[number]["id"];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewInspectionButton({ workOrders }: { workOrders: WorkOrderOption[] }) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [inspectionDate, setInspectionDate] = useState(todayISO);
  const [workOrderId, setWorkOrderId] = useState("");
  const [sampleSize, setSampleSize] = useState("");
  const [result, setResult] = useState<InspectionResult>("pass");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setInspectionDate(todayISO());
    setWorkOrderId("");
    setSampleSize("");
    setResult("pass");
    setNotes("");
    setError(null);
    setSubmitting(false);
    setOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const size = Number(sampleSize);
    if (!Number.isInteger(size) || size < 1) {
      setError("Sample size must be a whole number of at least 1.");
      return;
    }

    setSubmitting(true);
    try {
      const workOrder = workOrders.find((wo) => wo.id === workOrderId) ?? null;
      const res = await fetch("/api/quality/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspection_date: inspectionDate,
          sample_size: size,
          result,
          notes: notes.trim() || null,
          work_order_id: workOrder?.id ?? null,
          work_order_label: workOrder?.label ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to save the inspection."
        );
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the inspection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={openDialog}>+ New Inspection</Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id={titleId} className="text-lg font-semibold text-slate-900">
                  New inspection
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Log an AQL / quality check result.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="space-y-4 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-800">
                      Date <span className="text-rose-600">*</span>
                    </span>
                    <input
                      type="date"
                      value={inspectionDate}
                      onChange={(e) => setInspectionDate(e.target.value)}
                      required
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-800">
                      Sample size <span className="text-rose-600">*</span>
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={sampleSize}
                      onChange={(e) => setSampleSize(e.target.value)}
                      required
                      placeholder="e.g. 125"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-slate-800">
                    Work order (optional)
                  </span>
                  <select
                    value={workOrderId}
                    onChange={(e) => setWorkOrderId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">No work order</option>
                    {workOrders.map((wo) => (
                      <option key={wo.id} value={wo.id}>
                        {wo.label}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset>
                  <legend className="text-sm font-medium text-slate-800">
                    Result <span className="text-rose-600">*</span>
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {RESULT_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setResult(option.id)}
                        className={cn(
                          "min-h-11 rounded-xl px-5 py-2 text-sm font-medium transition-colors",
                          result === option.id
                            ? option.activeClass
                            : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label className="block">
                  <span className="text-sm font-medium text-slate-800">Notes</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Defects found, AQL level, follow-up needed..."
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </label>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 flex-1"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="min-h-11 flex-[1.4]">
                  {submitting ? "Saving..." : "Save inspection"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
