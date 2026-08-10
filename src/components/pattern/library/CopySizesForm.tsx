"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { CopyMeasurementSibling } from "@/lib/pattern-library/copy-measurements-to-siblings";
import { cn } from "@/lib/utils";

type CopyMode = "overwrite" | "fill_empty_only";

/**
 * Shared Copy sizes UI: pick piece (set garments), mode, and target consolidations.
 * Used on the measurement sheet tab and Pattern order board / job modals.
 */
export function CopySizesForm({
  patternId,
  patternRef,
  garmentType,
  dirty = false,
  defaultPieceScope,
  onCopied,
}: {
  patternId: string;
  patternRef: string;
  garmentType?: string | null;
  dirty?: boolean;
  /** Prefill piece (e.g. current Measurements Piece select). */
  defaultPieceScope?: string | null;
  onCopied?: () => void;
}) {
  const [siblings, setSiblings] = useState<CopyMeasurementSibling[]>([]);
  const [pieceOptions, setPieceOptions] = useState<string[]>([]);
  const [pieceScope, setPieceScope] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<CopyMode>("overwrite");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  // Concurrent loads (React strict-mode double effect / Refresh spam) must not
  // let a failed older request overwrite a successful newer one.
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      let data: {
        error?: string;
        siblings?: CopyMeasurementSibling[];
        piece_options?: string[];
      } | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(
          `/api/pattern/library/client-patterns/${patternId}/copy-measurements?t=${Date.now()}`,
          { cache: "no-store" }
        );
        data = await res.json().catch(() => null);
        if (res.ok) break;
        if (attempt === 1) throw new Error(data?.error ?? "Failed to load target sheets.");
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      if (seq !== loadSeq.current) return;
      const rows = (data?.siblings ?? []) as CopyMeasurementSibling[];
      const pieces = Array.isArray(data?.piece_options)
        ? (data.piece_options as string[])
        : [];
      setSiblings(rows);
      setPieceOptions(pieces);
      setSelected(new Set(rows.map((row) => row.id)));
      setPieceScope((prev) => {
        if (pieces.length === 0) return "all";
        const preferred = (defaultPieceScope ?? prev ?? "all").trim();
        if (!preferred || preferred.toLowerCase() === "all") return "all";
        const match = pieces.find(
          (piece) => piece.toLowerCase() === preferred.toLowerCase()
        );
        return match ?? "all";
      });
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setSiblings([]);
      setPieceOptions([]);
      setSelected(new Set());
      setError(err instanceof Error ? err.message : "Failed to load target sheets.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [patternId, defaultPieceScope]);

  useEffect(() => {
    void load();
  }, [load]);

  const allSelected = siblings.length > 0 && selected.size === siblings.length;
  const isSetGarment = pieceOptions.length > 1;
  const garmentLabel = garmentType?.trim() || "this garment";

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
            piece_scope: pieceScope,
          }),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Copy failed.");
      const updated = (data?.updated ?? []) as Array<{ pattern_ref: string }>;
      const skipped = (data?.skipped ?? []) as Array<{ pattern_ref: string; reason: string }>;
      const scopeLabel =
        pieceScope === "all"
          ? isSetGarment
            ? "all pieces"
            : "sizes"
          : pieceScope;
      setSummary(
        `Copied ${scopeLabel} to ${updated.length} sheet${updated.length === 1 ? "" : "s"}` +
          (skipped.length ? ` - skipped ${skipped.length}` : "") +
          (updated.length
            ? `: ${updated.map((row) => row.pattern_ref).join(", ")}`
            : "")
      );
      await load();
      onCopied?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copy failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900">
            Copy sizes to consolidations
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
              New
            </span>
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Push sizes from <span className="font-medium text-slate-800">{patternRef}</span> (
            {garmentLabel}) onto this client&apos;s other sheets with the same garment or a
            shared piece (e.g. Overshirt+Trouser can copy its Overshirt sizes onto
            Overshirt-only sheets). For set garments, pick Overshirt / Trouser / Both first.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void load()}
          disabled={loading || busy}
        >
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh list
        </Button>
      </div>

      {dirty ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          This sheet has unsaved edits. Save the measurement sheet first, then copy.
        </p>
      ) : null}

      {isSetGarment ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">Which piece to copy?</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPieceScope("all")}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium",
                pieceScope === "all"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              Both (all pieces)
            </button>
            {pieceOptions.map((piece) => (
              <button
                key={piece}
                type="button"
                onClick={() => setPieceScope(piece)}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  pieceScope === piece
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                )}
              >
                {piece} only
              </button>
            ))}
          </div>
        </div>
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
                  <p className="font-medium text-slate-900">
                    {row.pattern_ref}
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                      {row.garment_type}
                    </span>
                    {row.is_cross_garment ? (
                      <span className="ml-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">
                        {row.shared_pieces.join(" + ")} sizes only
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    {row.fabric || "No fabric label"}
                    {row.linked_fabric_count
                      ? `  /  ${row.linked_fabric_count} fabric line${
                          row.linked_fabric_count === 1 ? "" : "s"
                        }`
                      : ""}
                    {row.is_empty
                      ? "  /  empty sheet"
                      : `  /  ${row.filled_measurement_count} filled`}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            onClick={() => void runCopy()}
            disabled={busy || dirty || selected.size === 0}
          >
            <Copy className="mr-1.5 h-4 w-4" />
            {busy
              ? "Copying..."
              : `Copy ${
                  pieceScope === "all"
                    ? isSetGarment
                      ? "all pieces"
                      : "sizes"
                    : pieceScope
                } to ${selected.size} sheet${selected.size === 1 ? "" : "s"}`}
          </Button>
        </>
      )}

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      ) : null}
      {summary ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
          {summary}
        </p>
      ) : null}
    </div>
  );
}
