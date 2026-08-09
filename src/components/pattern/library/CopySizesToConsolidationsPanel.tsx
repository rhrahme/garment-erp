"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { CopyMeasurementSibling } from "@/lib/pattern-library/copy-measurements-to-siblings";
import { cn } from "@/lib/utils";

type CopyMode = "overwrite" | "fill_empty_only";

/**
 * Tab panel: push this sheet's sizes onto other same-client + same-garment
 * consolidation sheets (different fabric / composition groups).
 */
export function CopySizesToConsolidationsPanel({
  patternId,
  patternRef,
  dirty,
}: {
  patternId: string;
  patternRef: string;
  /** Warn Pattern to save the open sheet before copying. */
  dirty: boolean;
}) {
  const [siblings, setSiblings] = useState<CopyMeasurementSibling[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<CopyMode>("overwrite");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/pattern/library/client-patterns/${patternId}/copy-measurements?t=${Date.now()}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to load target sheets.");
      const rows = (data?.siblings ?? []) as CopyMeasurementSibling[];
      setSiblings(rows);
      setSelected(new Set(rows.map((row) => row.id)));
    } catch (err) {
      setSiblings([]);
      setSelected(new Set());
      setError(err instanceof Error ? err.message : "Failed to load target sheets.");
    } finally {
      setLoading(false);
    }
  }, [patternId]);

  useEffect(() => {
    void load();
  }, [load]);

  const allSelected = siblings.length > 0 && selected.size === siblings.length;

  const selectedRows = useMemo(
    () => siblings.filter((row) => selected.has(row.id)),
    [siblings, selected]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(siblings.map((row) => row.id)));
  }

  async function runCopy() {
    if (selected.size === 0) {
      setError("Select at least one consolidated sheet.");
      return;
    }
    if (dirty) {
      setError("Save this sheet first, then copy sizes.");
      return;
    }
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch(
        `/api/pattern/library/client-patterns/${patternId}/copy-measurements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_pattern_ids: [...selected],
            mode,
          }),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Copy failed.");
      const updated = (data?.updated ?? []) as Array<{ pattern_ref: string }>;
      const skipped = (data?.skipped ?? []) as Array<{ pattern_ref: string; reason: string }>;
      setSummary(
        `Copied to ${updated.length} sheet${updated.length === 1 ? "" : "s"}` +
          (skipped.length ? ` - skipped ${skipped.length}` : "") +
          (updated.length
            ? `: ${updated.map((row) => row.pattern_ref).join(", ")}`
            : "")
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copy failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Copy sizes to consolidations</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Push sizes from <span className="font-medium text-slate-800">{patternRef}</span> onto
            other sheets for this client with the same garment (other fabric / composition
            groups). Does not change which fabrics are linked - only the measurement numbers.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading || busy}>
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh list
        </Button>
      </div>

      {dirty ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          This sheet has unsaved edits. Save the measurement sheet first, then copy.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("overwrite")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium",
            mode === "overwrite"
              ? "bg-indigo-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          )}
        >
          Overwrite sizes
        </button>
        <button
          type="button"
          onClick={() => setMode("fill_empty_only")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium",
            mode === "fill_empty_only"
              ? "bg-indigo-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          )}
        >
          Fill empty only
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading consolidated sheets...</p>
      ) : siblings.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
          No other consolidated sheets for this client + garment. Auto-consolidate other
          fabric groups first, then copy sizes here.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-slate-300"
              />
              Select all ({siblings.length})
            </label>
            <p className="text-xs text-slate-500">{selectedRows.length} selected</p>
          </div>

          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {siblings.map((row) => (
              <li key={row.id} className="flex items-start gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => toggle(row.id)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold text-slate-900">
                    {row.pattern_ref}
                  </p>
                  <p className="truncate text-sm text-slate-700">
                    {row.fabric || row.notes || row.garment_type}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {row.linked_fabric_count} fabric
                    {row.linked_fabric_count === 1 ? "" : "s"}
                    {" - "}
                    {row.is_empty
                      ? "empty sheet"
                      : `${row.filled_measurement_count} filled - stores ${row.unit}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void runCopy()} disabled={busy || dirty || selected.size === 0}>
              <Copy className="mr-1.5 h-4 w-4" />
              {busy
                ? "Copying..."
                : mode === "overwrite"
                  ? `Copy sizes to ${selected.size} sheet${selected.size === 1 ? "" : "s"}`
                  : `Fill empty on ${selected.size} sheet${selected.size === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      )}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {summary ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{summary}</p>
      ) : null}
    </div>
  );
}
