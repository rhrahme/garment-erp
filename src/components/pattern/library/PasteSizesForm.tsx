"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { CopyMeasurementSibling } from "@/lib/pattern-library/copy-measurements-to-siblings";
import { cn } from "@/lib/utils";

type CopyMode = "overwrite" | "fill_empty_only";

/**
 * Paste sizes INTO this sheet: pick which filled sheet to take sizes from.
 * Reverse direction of CopySizesForm - same API, source and target swapped.
 */
export function PasteSizesForm({
  patternId,
  patternRef,
  garmentType,
  onPasted,
}: {
  /** The sheet that should RECEIVE the sizes. */
  patternId: string;
  patternRef: string;
  garmentType?: string | null;
  onPasted?: () => void;
}) {
  const [sources, setSources] = useState<CopyMeasurementSibling[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [targetGarment, setTargetGarment] = useState<string | null>(null);
  const [pieceScope, setPieceScope] = useState<string>("all");
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
        garment_type?: string;
        siblings?: CopyMeasurementSibling[];
      } | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(
          `/api/pattern/library/client-patterns/${patternId}/copy-measurements?t=${Date.now()}`,
          { cache: "no-store" }
        );
        data = await res.json().catch(() => null);
        if (res.ok) break;
        if (attempt === 1) throw new Error(data?.error ?? "Failed to load sheets.");
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      if (seq !== loadSeq.current) return;
      const rows = ((data?.siblings ?? []) as CopyMeasurementSibling[])
        .slice()
        .sort((a, b) => b.filled_measurement_count - a.filled_measurement_count);
      setTargetGarment(data?.garment_type ?? null);
      setSources(rows);
      const firstFilled = rows.find((row) => row.filled_measurement_count > 0);
      setSourceId(firstFilled?.id ?? null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setSources([]);
      setSourceId(null);
      setError(err instanceof Error ? err.message : "Failed to load sheets.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [patternId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => sources.find((row) => row.id === sourceId) ?? null,
    [sources, sourceId]
  );
  // Pieces the selected source can send here (same garment = all its pieces).
  const pieceOptions = useMemo(() => {
    const shared = selected?.shared_pieces ?? [];
    return shared.length > 1 ? shared : [];
  }, [selected]);

  useEffect(() => {
    setPieceScope("all");
  }, [sourceId]);

  async function runPaste() {
    if (!selected) {
      setError("Pick the sheet to take sizes from.");
      return;
    }
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch(
        `/api/pattern/library/client-patterns/${selected.id}/copy-measurements`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_pattern_ids: [patternId],
            mode,
            piece_scope: pieceScope,
          }),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Paste failed.");
      const updated = (data?.updated ?? []) as Array<{ pattern_ref: string }>;
      const skipped = (data?.skipped ?? []) as Array<{ pattern_ref: string; reason: string }>;
      if (updated.length === 0) {
        throw new Error(skipped[0]?.reason ?? "Nothing was pasted.");
      }
      setSummary(
        `Pasted ${pieceScope === "all" ? "sizes" : `${pieceScope} sizes`} from ${selected.pattern_ref} onto ${patternRef}.`
      );
      onPasted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paste failed.");
    } finally {
      setBusy(false);
    }
  }

  const garmentLabel = targetGarment?.trim() || garmentType?.trim() || "this garment";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Paste sizes onto this sheet
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            <span className="font-medium text-slate-800">{patternRef}</span> ({garmentLabel})
            will receive the measurements and comments. Pick which filled sheet to take them
            from - only this sheet&apos;s article and fabric stay its own.
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

      {loading ? (
        <p className="text-sm text-slate-500">Loading sheets...</p>
      ) : sources.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
          No other sheets for this client share this garment or one of its pieces.
        </p>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-800">Take sizes from:</p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {sources.map((row) => {
              const empty = row.filled_measurement_count === 0;
              return (
                <li key={row.id}>
                  <label
                    className={cn(
                      "flex items-start gap-3 px-3 py-2.5",
                      empty ? "opacity-50" : "cursor-pointer hover:bg-slate-50"
                    )}
                  >
                    <input
                      type="radio"
                      name="paste-source"
                      checked={sourceId === row.id}
                      onChange={() => setSourceId(row.id)}
                      disabled={empty}
                      className="mt-1 h-4 w-4 border-slate-300"
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
                        {empty ? "  /  empty sheet" : `  /  ${row.filled_measurement_count} filled`}
                      </p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>

          {pieceOptions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-800">Which piece to paste?</p>
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

          <Button
            type="button"
            onClick={() => void runPaste()}
            disabled={busy || !selected}
          >
            <ClipboardPaste className="mr-1.5 h-4 w-4" />
            {busy
              ? "Pasting..."
              : selected
                ? `Paste from ${selected.pattern_ref}`
                : "Paste sizes"}
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
