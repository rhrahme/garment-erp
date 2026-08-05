"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import {
  garmentLabel,
  garmentMatchesLibraryBase,
} from "@/lib/pattern-library/base-pattern-picker";
import {
  peekBasePickerData,
  preloadBasePickerData,
} from "@/lib/pattern-library/base-picker-cache";
import {
  buildSampleFillFromBase,
  summarizeSampleFill,
  type BaseGridColumn,
} from "@/lib/pattern-library/load-from-base";
import { sizesMatch } from "@/lib/pattern-library/tud-size-fill";
import { unitLabel } from "@/lib/pattern-library/measurements";
import type { TrialSheetPoint } from "@/lib/pattern-library/trial-sheet";
import type {
  BasePattern,
  ClientPattern,
  MeasurementPointDef,
} from "@/lib/types/pattern-library";
import { cn } from "@/lib/utils";

/**
 * Picker for "Load from base pattern": choose a library base (searchable,
 * defaults to the sheet's garment type), then a size column - or the client's
 * fit column when one exists on that base (preselected). The chosen column is
 * copied into the sheet's Sample cells, converting cm <-> inches when the
 * base grid and the sheet use different units.
 */
export function LoadFromBaseModal({
  pattern,
  rows,
  onClose,
  onApply,
}: {
  pattern: ClientPattern;
  rows: TrialSheetPoint[];
  onClose: () => void;
  onApply: (values: Record<string, number>, notice: string) => void;
}) {
  // Instant open: the page preloads the slim picker payload on mount, so the
  // cache is normally already warm here and no network wait happens at all.
  const preloaded = peekBasePickerData();
  const [bases, setBases] = useState<BasePattern[]>(preloaded?.base_patterns ?? []);
  const [dictionary, setDictionary] = useState<MeasurementPointDef[]>(
    preloaded?.dictionary ?? []
  );
  const [loading, setLoading] = useState(preloaded === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [allGarments, setAllGarments] = useState(false);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [columnKey, setColumnKey] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    preloadBasePickerData()
      .then((data) => {
        if (cancelled) return;
        setBases(data.base_patterns);
        setDictionary(data.dictionary);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("Failed to load the pattern library.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visibleBases = useMemo(() => {
    const query = search.trim().toLowerCase();
    return bases
      .filter(
        (base) =>
          allGarments || garmentMatchesLibraryBase(pattern.garment_type, base.garment_type)
      )
      .filter((base) => {
        if (!query) return true;
        return [base.name, base.cut_family, base.house_brand_code, base.garment_type]
          .filter(Boolean)
          .some((text) => text.toLowerCase().includes(query));
      });
  }, [bases, search, allGarments, pattern.garment_type]);

  const selectedBase = useMemo(
    () => bases.find((base) => base.id === selectedBaseId) ?? null,
    [bases, selectedBaseId]
  );

  const clientColumn = useMemo(
    () =>
      selectedBase?.client_columns?.find((col) => col.client_id === pattern.client_id) ?? null,
    [selectedBase, pattern.client_id]
  );

  function selectBase(base: BasePattern) {
    setSelectedBaseId(base.id);
    const fit = base.client_columns?.find((col) => col.client_id === pattern.client_id) ?? null;
    if (fit) {
      setColumnKey(`client:${fit.id}`);
      return;
    }
    const sizeMatch = pattern.base_size
      ? base.sizes.find((size) => sizesMatch(size, pattern.base_size!)) ?? null
      : null;
    setColumnKey(sizeMatch ? `size:${sizeMatch}` : "");
  }

  const column: BaseGridColumn | null = useMemo(() => {
    if (!selectedBase || !columnKey) return null;
    if (columnKey.startsWith("client:") && clientColumn) {
      return { kind: "client", column: clientColumn };
    }
    if (columnKey.startsWith("size:")) {
      return { kind: "size", size: columnKey.slice("size:".length) };
    }
    return null;
  }, [selectedBase, columnKey, clientColumn]);

  const preview = useMemo(() => {
    if (!selectedBase || !column) return null;
    return buildSampleFillFromBase({
      rows,
      base: selectedBase,
      column,
      sheetUnit: pattern.unit,
      dictionary,
    });
  }, [selectedBase, column, rows, pattern.unit, dictionary]);

  const columnLabel = column
    ? column.kind === "client"
      ? `client fit column (base ${column.column.base_size})`
      : `size ${column.size}`
    : "";

  function apply() {
    if (!selectedBase || !column || !preview) return;
    const summary = summarizeSampleFill(preview, rows.length);
    const unitNote = preview.converted
      ? ` Values converted from ${unitLabel(selectedBase.unit)} to ${unitLabel(pattern.unit)}.`
      : "";
    onApply(
      preview.values,
      `Sample column loaded from ${selectedBase.name} / ${columnLabel}: ${summary}.${unitNote} Review the cells and Save sheet.`
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Load Sample column from a base pattern"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">Load Sample from base pattern</p>
            <p className="text-xs text-slate-500">
              Copies one column of a library size grid into the Sample column - editable before
              saving.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading ? (
            <ul
              aria-label="Loading base patterns"
              className="animate-pulse divide-y divide-slate-100 rounded-lg border border-slate-200"
            >
              {[0, 1, 2, 3, 4].map((row) => (
                <li key={row} className="flex items-center justify-between gap-3 px-3 py-3">
                  <span className="min-w-0 flex-1 space-y-1.5">
                    <span className="block h-3.5 w-2/5 rounded bg-slate-200" />
                    <span className="block h-3 w-3/5 rounded bg-slate-100" />
                  </span>
                  <span className="h-3 w-1/4 shrink-0 rounded bg-slate-100" />
                </li>
              ))}
            </ul>
          ) : null}
          {loadError ? <p className="text-sm text-rose-600">{loadError}</p> : null}

          {!loading && !loadError && !selectedBase ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-56 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search base patterns..."
                    className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-sm"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={allGarments}
                    onChange={(e) => setAllGarments(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  All garments (not only {garmentLabel(pattern.garment_type)})
                </label>
              </div>
              {visibleBases.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  No {allGarments ? "" : `${garmentLabel(pattern.garment_type)} `}base patterns
                  match.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {visibleBases.map((base) => {
                    const fit =
                      base.client_columns?.find((col) => col.client_id === pattern.client_id) ??
                      null;
                    return (
                      <li key={base.id}>
                        <button
                          type="button"
                          onClick={() => selectBase(base)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-indigo-50/60"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-slate-800">
                              {base.name}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {base.house_brand_code} / {garmentLabel(base.garment_type)} /{" "}
                              {unitLabel(base.unit)}
                              {fit ? " / client fit column" : ""}
                            </span>
                          </span>
                          <span className="max-w-[38%] shrink-0 truncate text-xs text-slate-400">
                            {base.sizes.join(" ")}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : null}

          {selectedBase ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelectedBaseId(null);
                  setColumnKey("");
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Choose another base
              </button>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">{selectedBase.name}</p>
                <p className="text-xs text-slate-500">
                  {selectedBase.house_brand_code} / {garmentLabel(selectedBase.garment_type)} /
                  grid in {unitLabel(selectedBase.unit)}
                </p>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600">Column to copy</p>
                <div className="flex flex-wrap gap-1.5">
                  {clientColumn ? (
                    <button
                      type="button"
                      onClick={() => setColumnKey(`client:${clientColumn.id}`)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm font-medium",
                        columnKey === `client:${clientColumn.id}`
                          ? "bg-amber-500 text-white"
                          : "bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                      )}
                    >
                      {clientColumn.client_name} fit (base {clientColumn.base_size})
                    </button>
                  ) : null}
                  {selectedBase.sizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setColumnKey(`size:${size}`)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm font-medium",
                        columnKey === `size:${size}`
                          ? "bg-indigo-600 text-white"
                          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {selectedBase.unit !== pattern.unit ? (
                <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                  The base grid is in {unitLabel(selectedBase.unit)}; the sheet is in{" "}
                  {unitLabel(pattern.unit)}. Values are converted
                  {pattern.unit === "in" ? " (rounded to 1/16 inch)" : " (2 decimals)"}.
                </p>
              ) : null}

              {preview ? (
                <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
                  <p className="font-medium text-slate-800">
                    {preview.filled.length} of {rows.length} points will fill.
                  </p>
                  {preview.unmatched.length > 0 ? (
                    <p className="mt-1">
                      Left empty (no confident match or no value):{" "}
                      {preview.unmatched.join(", ")}
                    </p>
                  ) : null}
                  <p className="mt-1 text-slate-400">
                    Matched Sample cells are replaced; Trial and Final columns are untouched.
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!preview || preview.filled.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Copy into Sample
          </button>
        </div>
      </div>
    </div>
  );
}
