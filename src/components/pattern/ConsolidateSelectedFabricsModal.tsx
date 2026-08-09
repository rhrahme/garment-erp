"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { BasePatternCascadePicker } from "@/components/pattern/library/BasePatternCascadePicker";
import { Button } from "@/components/ui/Button";
import {
  cascadeSelectionReady,
  emptyCascadeValue,
  PATTERN_SHEET_GARMENTS,
  preferredBrandCodeFromClientCode,
  type BasePatternCascadeValue,
} from "@/lib/pattern-library/base-pattern-picker";
import { useMeasurementUnitPreference } from "@/hooks/useMeasurementUnitPreference";
import {
  formatGarmentWithPieceList,
  piecesForPatternJob,
} from "@/lib/sales-orders/label-codes";
import type { PatternJob } from "@/lib/types/pattern";
import type { BasePattern, ClientPattern } from "@/lib/types/pattern-library";
import type { SalesOrder } from "@/lib/types/sales-orders";
import { cn } from "@/lib/utils";

function formatArticle(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

type ConsolidateSelectedFabricsModalProps = {
  order: SalesOrder;
  selectedJobs: PatternJob[];
  clientPatterns: ClientPattern[];
  onClose: () => void;
  onLinked: () => Promise<void>;
};

export function ConsolidateSelectedFabricsModal({
  order,
  selectedJobs,
  clientPatterns,
  onClose,
  onLinked,
}: ConsolidateSelectedFabricsModalProps) {
  const router = useRouter();
  const { unit: measurementUnit } = useMeasurementUnitPreference();
  const preferredBrand = preferredBrandCodeFromClientCode(order.client_code);
  const selectedGarments = useMemo(
    () => [...new Set(selectedJobs.map((job) => job.garment_type))],
    [selectedJobs]
  );
  const sharedGarment = selectedGarments.length === 1 ? selectedGarments[0]! : "";

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [bases, setBases] = useState<BasePattern[]>([]);
  const [cascade, setCascade] = useState<BasePatternCascadeValue>(() => ({
    ...emptyCascadeValue(preferredBrand),
    garmentType: sharedGarment,
    origin: "custom",
  }));
  const [existingPatternId, setExistingPatternId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pattern/library", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBases(data?.base_patterns ?? []))
      .catch(() => setBases([]));
  }, []);

  useEffect(() => {
    if (!sharedGarment) return;
    setCascade((prev) => (prev.garmentType ? prev : { ...prev, garmentType: sharedGarment }));
  }, [sharedGarment]);

  const existingForClient = useMemo(() => {
    const garment = cascade.garmentType || sharedGarment;
    return clientPatterns
      .filter((pattern) => pattern.client_id === order.client_id)
      .filter((pattern) => !garment || pattern.garment_type === garment)
      .sort((a, b) => a.pattern_ref.localeCompare(b.pattern_ref));
  }, [cascade.garmentType, clientPatterns, order.client_id, sharedGarment]);

  useEffect(() => {
    if (mode !== "existing") return;
    if (existingForClient.some((pattern) => pattern.id === existingPatternId)) return;
    setExistingPatternId(existingForClient[0]?.id ?? "");
  }, [existingForClient, existingPatternId, mode]);

  async function linkJobsToPattern(patternId: string) {
    for (const job of selectedJobs) {
      const res = await fetch(`/api/pattern/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_pattern_id: patternId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Failed to link ${formatArticle(job.article_number)}`);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      let patternId = "";

      if (mode === "existing") {
        if (!existingPatternId) throw new Error("Choose an existing pattern for this client.");
        const lineIds = selectedJobs.map((job) => job.sales_order_line_id);
        const res = await fetch(
          `/api/pattern/library/client-patterns/${existingPatternId}/fabric-lines`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ line_ids: lineIds }),
          }
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Failed to assign fabrics.");
        patternId = existingPatternId;
        await linkJobsToPattern(patternId);
      } else {
        if (!cascadeSelectionReady(cascade)) {
          throw new Error(
            cascade.origin === "library"
              ? "Choose garment, library base, and size."
              : "Choose a garment sheet type."
          );
        }
        const res = await fetch("/api/pattern/library/client-patterns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: order.client_id,
            client_code: order.client_code,
            client_name: order.client_name,
            garment_type: cascade.garmentType,
            base_pattern_id:
              cascade.origin === "library" ? cascade.basePatternId || null : null,
            base_size: cascade.origin === "library" ? cascade.baseSize || null : null,
            linked_fabric_line_ids: selectedJobs.map((job) => job.sales_order_line_id),
            // Match Pattern's Units toggle so CM typing is not stamped as inches.
            unit: measurementUnit,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Failed to create pattern.");
        patternId = data.pattern?.id as string;
        if (!patternId) throw new Error("Pattern created but id missing.");
        await linkJobsToPattern(patternId);
      }

      await onLinked();
      // Back to the order board - do not open the bare master sheet (no job/line),
      // or Print A4 would show a sibling fabric. Open each job for that fabric's print.
      router.push(`/pattern/orders/${order.id}?consolidated=${encodeURIComponent(patternId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Consolidate failed.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Consolidate fabrics to one pattern"
    >
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Consolidate {selectedJobs.length} fabric
              {selectedJobs.length === 1 ? "" : "s"} → one pattern
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Then upload the .TUD and fill sizes on the measurement sheet.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ul className="mt-3 flex flex-wrap gap-1.5">
          {selectedJobs.map((job) => (
            <li
              key={job.id}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              <span className="font-mono">
                {formatArticle(job.article_number)} · {job.fabric_number}
              </span>
              <span className="ml-1.5 font-normal text-slate-500">
                {formatGarmentWithPieceList(job.garment_type, piecesForPatternJob(job))}
              </span>
            </li>
          ))}
        </ul>

        {selectedGarments.length > 1 ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Selected lines mix garments ({selectedGarments.join(", ")}). Pick one garment sheet
            below — usually consolidate only the same garment together.
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("new")}
            className={cn(
              "flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              mode === "new"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200"
            )}
          >
            New pattern
          </button>
          <button
            type="button"
            onClick={() => setMode("existing")}
            disabled={existingForClient.length === 0 && !sharedGarment}
            className={cn(
              "flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-40",
              mode === "existing"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200"
            )}
          >
            Existing pattern
          </button>
        </div>

        {mode === "new" ? (
          <div className="mt-4 space-y-3">
            <BasePatternCascadePicker
              bases={bases}
              extraGarments={[...PATTERN_SHEET_GARMENTS, ...selectedGarments]}
              value={cascade}
              onChange={setCascade}
            />
            <p className="text-xs text-slate-500">
              Custom = fill dimensions on the sheet. Library base = prefill from FR/GL cut + size.
              After create you land on the pattern page to upload the .TUD.
            </p>
          </div>
        ) : (
          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Client pattern{sharedGarment ? ` (${sharedGarment})` : ""}
            </span>
            <select
              value={existingPatternId}
              onChange={(e) => setExistingPatternId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              {existingForClient.length === 0 ? (
                <option value="">No patterns for this garment yet</option>
              ) : (
                existingForClient.map((pattern) => (
                  <option key={pattern.id} value={pattern.id}>
                    {pattern.pattern_ref} · {pattern.garment_type}
                  </option>
                ))
              )}
            </select>
          </label>
        )}

        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void submit()} disabled={busy} className="flex-1 sm:flex-none">
            {busy
              ? "Working…"
              : mode === "new"
                ? "Create pattern → upload .TUD"
                : "Link & open pattern"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
