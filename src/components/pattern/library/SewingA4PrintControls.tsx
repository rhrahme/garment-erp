"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckSquare, CircleHelp, Printer, Square, X } from "lucide-react";
import { useMeasurementUnitPreference } from "@/hooks/useMeasurementUnitPreference";
import type { ClientFabricBoardRow } from "@/lib/pattern-library/client-fabric-board";
import { withMeasurementUnitParam } from "@/lib/pattern-library/measurement-unit-preference";
import type { PatternSheetKind } from "@/lib/pattern-library/pattern-sheet-kind";
import type { MeasurementUnit } from "@/lib/types/pattern-library";
import { cn } from "@/lib/utils";

type SewingA4PrintControlsProps = {
  patternId: string;
  /** @deprecated Unused - linked rows come from the sheet GET. Kept optional for callers. */
  clientId?: string;
  versionId?: string | null;
  /** sewing (default) or production - same piece/QR expand; lines= selects papers. */
  sheetKind?: Extract<PatternSheetKind, "sewing" | "production">;
  /** Button label. */
  label?: string;
  /** Pre-tick these SO line ids (e.g. current job fabric). */
  defaultLineIds?: string[] | null;
  /** Amber New badge + ring (Sewing A4s). */
  showNewBadge?: boolean;
  /** Indigo primary (Sewing) vs white toolbar style (Print production). */
  emphasize?: boolean;
};

const HELP_TEXT =
  "Print one A4 per stitcher piece (Overshirt / Trouser / ...) with that piece's floor QR and measurements. Multi-piece garments split across pages for different stitchers. Tick which fabric articles to include (Select all = every linked fabric with its own QR), open preview, then print.";

function stitcherPrintHref(
  patternId: string,
  sheetKind: "sewing" | "production",
  versionId: string | null | undefined,
  lineIds: string[],
  unit: MeasurementUnit
): string {
  const params = new URLSearchParams({ sheet: sheetKind });
  if (versionId) params.set("version", versionId);
  if (lineIds.length > 0) params.set("lines", lineIds.join(","));
  return withMeasurementUnitParam(
    `/pattern/client-patterns/${patternId}/print?${params.toString()}`,
    unit
  );
}

/**
 * Tick which fabric articles to print (Select all or subset), then open
 * stitcher A4 preview - one page per article QR, piece-split for OT/Suit.
 */
export function SewingA4PrintControls({
  patternId,
  versionId,
  sheetKind = "sewing",
  label,
  defaultLineIds = null,
  showNewBadge = sheetKind === "sewing",
  emphasize = sheetKind === "sewing",
}: SewingA4PrintControlsProps) {
  const buttonLabel =
    label ?? (sheetKind === "production" ? "Print production" : "Sewing A4s");
  const { unit: displayUnit } = useMeasurementUnitPreference();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [rows, setRows] = useState<ClientFabricBoardRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Sheet-scoped linked rows (not full client fabric board + archive).
      const res = await fetch(`/api/pattern/library/client-patterns/${patternId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Could not load grouped fabrics.");
      const data = await res.json();
      const linked: ClientFabricBoardRow[] = Array.isArray(data.linked_fabric_rows)
        ? data.linked_fabric_rows
        : [];
      setRows(linked);
      const defaults = (defaultLineIds ?? [])
        .map((id) => id.trim())
        .filter(Boolean)
        .filter((id) => linked.some((row) => row.line_id === id));
      setSelected(
        new Set(defaults.length > 0 ? defaults : linked.map((row) => row.line_id))
      );
    } catch (err) {
      setRows([]);
      setSelected(new Set());
      setError(err instanceof Error ? err.message : "Could not load grouped fabrics.");
    }
  }, [patternId, defaultLineIds]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const allIds = useMemo(() => (rows ?? []).map((row) => row.line_id), [rows]);
  const selectedCount = selected.size;
  const allSelected = allIds.length > 0 && selectedCount === allIds.length;
  const selectedList = useMemo(() => allIds.filter((id) => selected.has(id)), [allIds, selected]);
  const previewHref = stitcherPrintHref(
    patternId,
    sheetKind,
    versionId,
    selectedList,
    displayUnit
  );

  function toggleOne(lineId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  return (
    <div className="relative flex items-center gap-1">
      <div
        className={cn(
          "inline-flex items-stretch overflow-hidden rounded-lg shadow-sm",
          showNewBadge || emphasize ? "ring-2 ring-amber-400" : "ring-1 ring-slate-200"
        )}
      >
        <button
          type="button"
          onClick={() => {
            setHelpOpen(false);
            setOpen((prev) => !prev);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium",
            emphasize
              ? "bg-indigo-600 text-white hover:bg-indigo-700"
              : "bg-white text-slate-700 hover:bg-slate-50"
          )}
        >
          <Printer className="h-4 w-4" />
          {buttonLabel}
          {showNewBadge ? (
            <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
              New
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setHelpOpen((prev) => !prev);
          }}
          className={cn(
            "inline-flex items-center border-l px-2",
            emphasize
              ? "border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          )}
          aria-label={`What is ${buttonLabel}?`}
          aria-expanded={helpOpen}
          title={`What is ${buttonLabel}?`}
        >
          <CircleHelp className="h-4 w-4" />
        </button>
      </div>

      {helpOpen ? (
        <div className="absolute right-0 z-30 mt-2 top-full w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-amber-200 bg-amber-50 p-3 shadow-lg">
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-amber-950">{buttonLabel} - what is this?</p>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="rounded-md p-1 text-amber-700 hover:bg-amber-100"
              aria-label="Close help"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs leading-relaxed text-amber-900">{HELP_TEXT}</p>
          <button
            type="button"
            onClick={() => {
              setHelpOpen(false);
              setOpen(true);
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            <Printer className="h-3.5 w-3.5" />
            Open {buttonLabel}
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="absolute right-0 z-30 mt-2 top-full w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                Preview stitcher A4s
                {showNewBadge ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                    New
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                One A4 per fabric QR (piece-split when needed). Select all or tick papers, then
                open preview.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {rows === null ? (
            <p className="text-xs text-slate-400">Loading articles...</p>
          ) : error ? (
            <p className="text-xs text-rose-600">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-slate-500">
              No SO fabric lines grouped into this pattern yet. Consolidate fabrics first.
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900"
                >
                  {allSelected ? (
                    <CheckSquare className="h-3.5 w-3.5" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                  {allSelected ? "Clear all" : "Select all"}
                </button>
                <span className="text-xs text-slate-500">
                  {selectedCount} of {rows.length}
                </span>
              </div>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {rows.map((row) => {
                  const checked = selected.has(row.line_id);
                  return (
                    <li key={row.line_id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50",
                          checked ? "bg-indigo-50/70" : ""
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(row.line_id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
                        />
                        <span className="min-w-0">
                          <span className="font-mono text-sm font-semibold text-slate-900">
                            {row.article_code}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {row.fabric_number}
                            {row.color ? ` - ${row.color}` : ""}
                            {row.garment_type ? ` - ${row.garment_type}` : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <Link
                  href={previewHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={selectedCount === 0}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white",
                    selectedCount === 0
                      ? "pointer-events-none bg-slate-300"
                      : "bg-indigo-600 hover:bg-indigo-700"
                  )}
                  onClick={() => {
                    if (selectedCount > 0) setOpen(false);
                  }}
                >
                  <Printer className="h-4 w-4" />
                  Open preview ({selectedCount})
                </Link>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
