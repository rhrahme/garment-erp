"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Layers, X } from "lucide-react";
import type {
  ClientFabricBoard,
  ClientFabricBoardRow,
  ClientFabricStatus,
} from "@/lib/pattern-library/client-fabric-board";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<ClientFabricStatus, string> = {
  on_order: "bg-slate-100 text-slate-600",
  received: "bg-sky-100 text-sky-800",
  washing: "bg-blue-100 text-blue-800",
  drying: "bg-cyan-100 text-cyan-800",
  ironing: "bg-amber-100 text-amber-800",
  ready: "bg-emerald-100 text-emerald-800",
};

/** Fabrics grouped into this garment on the client fabric board — editable. */
export function LinkedFabricsCard({
  clientId,
  patternId,
}: {
  clientId: string;
  patternId: string;
}) {
  const [rows, setRows] = useState<ClientFabricBoardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pattern/library/client-fabrics/${clientId}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      const board: ClientFabricBoard = await res.json();
      setRows(board.rows.filter((row) => row.assigned_pattern?.pattern_id === patternId));
    } catch {
      setRows([]);
    }
  }, [clientId, patternId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(row: ClientFabricBoardRow) {
    setError(null);
    try {
      const res = await fetch(`/api/pattern/library/client-patterns/${patternId}/fabric-lines`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_ids: [row.line_id] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to remove fabric.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove fabric.");
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Layers className="h-4 w-4 text-slate-400" />
          Grouped fabrics {rows ? `(${rows.length})` : ""}
        </p>
        <Link
          href={`/pattern/library/fabrics/${clientId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
        >
          Client fabric board
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {rows === null ? (
        <p className="text-xs text-slate-400">Loading fabrics…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-400">
          No fabrics grouped into this garment yet — tick them on the client fabric board.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li
              key={row.line_id}
              className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm"
            >
              <span className="font-mono font-semibold text-slate-800">{row.article_code}</span>
              <span className="truncate text-xs text-slate-500">
                {row.fabric_number} · {row.supplier_name}
              </span>
              <span
                className={cn(
                  "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  STATUS_STYLES[row.status]
                )}
              >
                {row.status_label}
              </span>
              <button
                type="button"
                onClick={() => void remove(row)}
                className="shrink-0 rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Remove ${row.article_code} from this pattern`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
