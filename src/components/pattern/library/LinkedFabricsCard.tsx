"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, ImageOff, Layers, X } from "lucide-react";
import { FabricSwatchPreview } from "@/components/fabric/FabricSwatchPreview";
import { FabricSwatchProvider, useFabricSwatch } from "@/components/fabric/FabricSwatchProvider";
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
  const [detailLineId, setDetailLineId] = useState<string | null>(null);

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

  const swatchKeys = useMemo(
    () =>
      (rows ?? []).map((row) => ({
        supplier_id: row.supplier_id,
        fabric_number: row.fabric_number,
      })),
    [rows]
  );

  const detailRow = useMemo(
    () => rows?.find((row) => row.line_id === detailLineId) ?? null,
    [rows, detailLineId]
  );

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
    <FabricSwatchProvider fabrics={swatchKeys}>
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
                <FabricSwatchPreview
                  supplierId={row.supplier_id}
                  fabricNumber={row.fabric_number}
                  className="!h-9 !w-9 rounded-md [&_img]:!h-full [&_img]:!w-full"
                />
                <button
                  type="button"
                  onClick={() => setDetailLineId(row.line_id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="font-mono font-semibold text-slate-800">{row.article_code}</span>
                  <span className="ml-2 truncate text-xs text-slate-500">
                    {row.fabric_number} · {row.supplier_name}
                  </span>
                </button>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    STATUS_STYLES[row.status]
                  )}
                >
                  {row.status_label}
                </span>
                <button
                  type="button"
                  onClick={() => setDetailLineId(row.line_id)}
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                  aria-label={`Preview ${row.article_code}`}
                  title="Preview fabric"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
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

        {detailRow ? (
          <LinkedFabricPreviewDialog row={detailRow} onClose={() => setDetailLineId(null)} />
        ) : null}
      </div>
    </FabricSwatchProvider>
  );
}

function LinkedFabricPreviewDialog({
  row,
  onClose,
}: {
  row: ClientFabricBoardRow;
  onClose: () => void;
}) {
  const getSwatch = useFabricSwatch();
  const urls = getSwatch?.(row.supplier_id, row.fabric_number);
  const src = urls?.zoom ?? urls?.square;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Fabric ${row.article_code}`}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-lg font-bold text-slate-900">{row.article_code}</p>
            <p className="mt-0.5 text-sm text-slate-600">
              <span className="font-mono">{row.fabric_number}</span> · {row.supplier_name}
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
        {!src || failed ? (
          <div
            className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400"
            aria-label={`No photo for fabric ${row.fabric_number}`}
          >
            <ImageOff className="h-8 w-8" />
            <p className="text-sm font-medium text-slate-500">No photo</p>
            <p className="text-xs text-slate-400">No swatch image for {row.fabric_number}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Fabric ${row.fabric_number}`}
              className="mx-auto max-h-64 w-full object-contain"
              onError={() => setFailed(true)}
            />
          </div>
        )}
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Composition</dt>
            <dd className="text-right text-slate-800">{row.composition ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Color</dt>
            <dd className="text-right text-slate-800">{row.color ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Status</dt>
            <dd className="text-right text-slate-800">{row.status_label}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
