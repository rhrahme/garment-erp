"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckSquare, Printer, Square, X } from "lucide-react";
import type { ClientFabricBoard, ClientFabricBoardRow } from "@/lib/pattern-library/client-fabric-board";
import { cn } from "@/lib/utils";

type SewingA4PrintControlsProps = {
  patternId: string;
  clientId: string;
  versionId?: string | null;
};

function sewingPrintHref(
  patternId: string,
  versionId: string | null | undefined,
  lineIds: string[]
): string {
  const params = new URLSearchParams({ sheet: "sewing" });
  if (versionId) params.set("version", versionId);
  if (lineIds.length > 0) params.set("lines", lineIds.join(","));
  return `/pattern/client-patterns/${patternId}/print?${params.toString()}`;
}

/**
 * One-click preview of sewing A4s (one page per article QR). Tick which
 * articles to include, then open the print preview.
 */
export function SewingA4PrintControls({
  patternId,
  clientId,
  versionId,
}: SewingA4PrintControlsProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ClientFabricBoardRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/pattern/library/client-fabrics/${clientId}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Could not load grouped fabrics.");
      const board: ClientFabricBoard = await res.json();
      const linked = board.rows.filter((row) => row.assigned_pattern?.pattern_id === patternId);
      setRows(linked);
      setSelected(new Set(linked.map((row) => row.line_id)));
    } catch (err) {
      setRows([]);
      setSelected(new Set());
      setError(err instanceof Error ? err.message : "Could not load grouped fabrics.");
    }
  }, [clientId, patternId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const allIds = useMemo(() => (rows ?? []).map((row) => row.line_id), [rows]);
  const selectedCount = selected.size;
  const allSelected = allIds.length > 0 && selectedCount === allIds.length;
  const selectedList = useMemo(() => allIds.filter((id) => selected.has(id)), [allIds, selected]);
  const previewHref = sewingPrintHref(patternId, versionId, selectedList);

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
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        <Printer className="h-4 w-4" />
        Sewing A4s
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">Preview sewing A4s</p>
              <p className="mt-0.5 text-xs text-slate-500">
                One A4 per article with the floor QR. Tick pages, then open preview.
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
                            {row.color ? ` · ${row.color}` : ""}
                            {row.garment_type ? ` · ${row.garment_type}` : ""}
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
