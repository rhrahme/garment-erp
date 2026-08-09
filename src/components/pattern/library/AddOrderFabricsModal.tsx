"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, X } from "lucide-react";
import { FabricSwatchPreview } from "@/components/fabric/FabricSwatchPreview";
import { FabricSwatchProvider } from "@/components/fabric/FabricSwatchProvider";
import type {
  ClientFabricBoard,
  ClientFabricBoardRow,
} from "@/lib/pattern-library/client-fabric-board";
import { cn } from "@/lib/utils";

type AssignFilter = "order" | "unassigned" | "all";

/**
 * Pick SO fabric lines from the client's order list and group them onto this
 * client pattern (same assign API as the Client fabric board).
 */
export function AddOrderFabricsModal({
  clientId,
  patternId,
  patternRef,
  preferredSoNumbers = [],
  onClose,
  onAssigned,
}: {
  clientId: string;
  patternId: string;
  patternRef: string;
  /** When set, default filter prefers fabrics on these sales orders. */
  preferredSoNumbers?: string[];
  onClose: () => void;
  onAssigned: (pattern: unknown) => void;
}) {
  const preferredSoSet = useMemo(
    () => new Set(preferredSoNumbers.map((so) => so.trim().toLowerCase()).filter(Boolean)),
    [preferredSoNumbers]
  );
  const [board, setBoard] = useState<ClientFabricBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<AssignFilter>(
    preferredSoSet.size > 0 ? "order" : "unassigned"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/library/client-fabrics/${clientId}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load order fabrics.");
      setBoard(await res.json());
    } catch (err) {
      setBoard(null);
      setError(err instanceof Error ? err.message : "Failed to load order fabrics.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const linkedOnThis = useMemo(() => {
    if (!board) return new Set<string>();
    return new Set(
      board.rows
        .filter((row) => row.assigned_pattern?.pattern_id === patternId)
        .map((row) => row.line_id)
    );
  }, [board, patternId]);

  const visibleRows = useMemo(() => {
    if (!board) return [];
    return board.rows.filter((row) => {
      if (linkedOnThis.has(row.line_id)) return false;
      if (filter === "unassigned") return !row.assigned_pattern;
      if (filter === "order") {
        if (preferredSoSet.size === 0) return true;
        return preferredSoSet.has(row.so_number.trim().toLowerCase());
      }
      return true;
    });
  }, [board, filter, linkedOnThis, preferredSoSet]);

  const orderGroups = useMemo(() => {
    const groups: { so_number: string; order_date: string; rows: ClientFabricBoardRow[] }[] = [];
    const indexBySo = new Map<string, number>();
    for (const row of visibleRows) {
      const key = row.so_number;
      const existing = indexBySo.get(key);
      if (existing === undefined) {
        indexBySo.set(key, groups.length);
        groups.push({ so_number: row.so_number, order_date: row.order_date, rows: [row] });
      } else {
        groups[existing]!.rows.push(row);
      }
    }
    return groups;
  }, [visibleRows]);

  const swatchKeys = useMemo(
    () =>
      visibleRows.map((row) => ({
        supplier_id: row.supplier_id,
        fabric_number: row.fabric_number,
      })),
    [visibleRows]
  );

  function toggle(lineId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  function toggleGroup(rows: ClientFabricBoardRow[]) {
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = rows.every((row) => next.has(row.line_id));
      for (const row of rows) {
        if (allSelected) next.delete(row.line_id);
        else next.add(row.line_id);
      }
      return next;
    });
  }

  async function submit() {
    const lineIds = [...selected];
    if (lineIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/library/client-patterns/${patternId}/fabric-lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_ids: lineIds }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to add fabrics.");
      onAssigned(body?.pattern);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add fabrics.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={() => {
        if (!busy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Add fabrics from order list"
    >
      <div
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Layers className="h-4 w-4 text-indigo-600" />
              Add fabrics from order
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Tick lines from this client&apos;s sales orders to group onto{" "}
              <span className="font-mono font-medium text-slate-700">{patternRef}</span>.
              Lines already on another pattern will be moved here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3">
          {(
            [
              preferredSoSet.size > 0 ? (["order", "This order"] as const) : null,
              ["unassigned", "Unassigned"] as const,
              ["all", "All orders"] as const,
            ].filter(Boolean) as [AssignFilter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                filter === id
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="text-sm text-slate-400">Loading order fabrics...</p>
          ) : error && !board ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : orderGroups.length === 0 ? (
            <p className="text-sm text-slate-500">
              No fabrics left to add for this filter. Already-linked lines are hidden.
            </p>
          ) : (
            <FabricSwatchProvider fabrics={swatchKeys}>
              <ul className="space-y-4">
                {orderGroups.map((group) => {
                  const allSelected = group.rows.every((row) => selected.has(row.line_id));
                  return (
                    <li key={group.so_number}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {group.so_number}
                        </p>
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.rows)}
                          className="text-xs font-medium text-indigo-700 hover:underline"
                        >
                          {allSelected ? "Clear" : "Select all"}
                        </button>
                      </div>
                      <ul className="space-y-1">
                        {group.rows.map((row) => {
                          const checked = selected.has(row.line_id);
                          const other = row.assigned_pattern;
                          return (
                            <li key={row.line_id}>
                              <label
                                className={cn(
                                  "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ring-1 transition-colors",
                                  checked
                                    ? "bg-indigo-50 ring-indigo-200"
                                    : "bg-slate-50 ring-transparent hover:bg-slate-100"
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggle(row.line_id)}
                                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                                />
                                <FabricSwatchPreview
                                  supplierId={row.supplier_id}
                                  fabricNumber={row.fabric_number}
                                  className="!h-9 !w-9 shrink-0 rounded-md [&_img]:!h-full [&_img]:!w-full"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="font-mono font-semibold text-slate-800">
                                    {row.article_code}
                                  </span>
                                  <span className="ml-2 text-xs text-slate-500">
                                    {row.fabric_number} / {row.garment_type}
                                  </span>
                                  {other ? (
                                    <span className="mt-0.5 block text-[11px] text-amber-700">
                                      On {other.pattern_ref}  -  will move here
                                    </span>
                                  ) : null}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </FabricSwatchProvider>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
          {error && board ? <p className="text-sm text-rose-600">{error}</p> : <span />}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || selected.size === 0}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy
                ? "Adding..."
                : `Add ${selected.size || ""} fabric${selected.size === 1 ? "" : "s"}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
