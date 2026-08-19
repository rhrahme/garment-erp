"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, ImageOff, Layers, Plus, X } from "lucide-react";
import { FabricSwatchPreview } from "@/components/fabric/FabricSwatchPreview";
import { FabricSwatchProvider, useFabricSwatch } from "@/components/fabric/FabricSwatchProvider";
import type {
  ClientFabricBoardRow,
  ClientFabricStatus,
} from "@/lib/pattern-library/client-fabric-board";
import type { ClientPatternFabricRef } from "@/lib/types/pattern-library";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<ClientFabricStatus, string> = {
  on_order: "bg-slate-100 text-slate-600",
  received: "bg-sky-100 text-sky-800",
  washing: "bg-blue-100 text-blue-800",
  drying: "bg-cyan-100 text-cyan-800",
  ironing: "bg-amber-100 text-amber-800",
  ready: "bg-emerald-100 text-emerald-800",
};

/** Fabrics grouped into this garment - SO board lines + catalog refs. */
export function LinkedFabricsCard({
  clientId,
  patternId,
  fabricRefs = [],
  initialRows = null,
  onAddFromOrder,
}: {
  clientId: string;
  patternId: string;
  fabricRefs?: ClientPatternFabricRef[];
  /** From sheet GET linked_fabric_rows - skips full client fabric board. */
  initialRows?: ClientFabricBoardRow[] | null;
  /** Opens the order-list fabric picker on the parent sheet. */
  onAddFromOrder?: () => void;
}) {
  const [rows, setRows] = useState<ClientFabricBoardRow[] | null>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [detailLineId, setDetailLineId] = useState<string | null>(null);
  const [detailRef, setDetailRef] = useState<ClientPatternFabricRef | null>(null);

  const load = useCallback(async () => {
    try {
      // Sheet-scoped rows (no archive / full board).
      const res = await fetch(`/api/pattern/library/client-patterns/${patternId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setRows(Array.isArray(data.linked_fabric_rows) ? data.linked_fabric_rows : []);
    } catch {
      setRows([]);
    }
  }, [patternId]);

  useEffect(() => {
    if (initialRows != null) {
      setRows(initialRows);
      return;
    }
    void load();
  }, [initialRows, load]);

  const swatchKeys = useMemo(
    () => [
      ...(rows ?? []).map((row) => ({
        supplier_id: row.supplier_id,
        fabric_number: row.fabric_number,
      })),
      ...fabricRefs
        .filter((ref) => ref.supplier_id)
        .map((ref) => ({
          supplier_id: ref.supplier_id!,
          fabric_number: ref.fabric_number,
        })),
    ],
    [rows, fabricRefs]
  );

  const detailRow = useMemo(
    () => rows?.find((row) => row.line_id === detailLineId) ?? null,
    [rows, detailLineId]
  );

  const totalCount = (rows?.length ?? 0) + fabricRefs.length;

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
            Grouped fabrics {rows ? `(${totalCount})` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {onAddFromOrder ? (
              <button
                type="button"
                onClick={onAddFromOrder}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
              >
                <Plus className="h-3 w-3" />
                Add from order
              </button>
            ) : null}
            <Link
              href={`/pattern/library/fabrics/${clientId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
            >
              Client fabric board
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
        {totalCount > 1 ? (
          <p className="mb-2 text-xs text-slate-500">
            Need to take one fabric out later? Press Remove on that row - it leaves this
            group and goes back to unassigned. The other fabrics stay together. Full steps
            are on the How-to tab.
          </p>
        ) : null}
        {rows === null ? (
          <p className="text-xs text-slate-400">Loading fabrics...</p>
        ) : totalCount === 0 ? (
          <p className="text-xs text-slate-400">
            No fabrics grouped into this garment yet - use Add fabrics from order, or tick them
            on the client fabric board.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {fabricRefs.map((ref) => (
              <li
                key={`ref:${ref.supplier_id ?? ""}:${ref.fabric_number}`}
                className="flex items-center gap-2 rounded-lg bg-teal-50 px-2.5 py-1.5 text-sm"
              >
                {ref.supplier_id ? (
                  <FabricSwatchPreview
                    supplierId={ref.supplier_id}
                    fabricNumber={ref.fabric_number}
                    className="!h-9 !w-9 rounded-md [&_img]:!h-full [&_img]:!w-full"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-slate-400">
                    <ImageOff className="h-4 w-4" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setDetailRef(ref)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="font-mono font-semibold text-slate-800">{ref.fabric_number}</span>
                  <span className="ml-2 truncate text-xs text-slate-500">
                    {ref.supplier_name ?? "Catalog"}
                    {ref.composition ? ` · ${ref.composition}` : ""}
                  </span>
                </button>
                <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-800">
                  Pattern
                </span>
                <button
                  type="button"
                  onClick={() => setDetailRef(ref)}
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                  aria-label={`Preview ${ref.fabric_number}`}
                  title="Preview fabric"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {(rows ?? []).map((row) => (
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
                  onClick={() => {
                    const ok = window.confirm(
                      `Remove ${row.article_code} (${row.fabric_number}) from this grouped pattern?\n\nThe fabric stays on the order. It just leaves this consolidation so you can treat it separately.`
                    );
                    if (ok) void remove(row);
                  }}
                  className="shrink-0 rounded px-1.5 py-1 text-[11px] font-medium text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                  aria-label={`Remove ${row.article_code} from this grouped pattern`}
                  title="Remove this fabric from the consolidation"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}

        {detailRow ? (
          <LinkedFabricPreviewDialog row={detailRow} onClose={() => setDetailLineId(null)} />
        ) : null}
        {detailRef ? (
          <CatalogFabricPreviewDialog refRow={detailRef} onClose={() => setDetailRef(null)} />
        ) : null}
      </div>
    </FabricSwatchProvider>
  );
}

function CatalogFabricPreviewDialog({
  refRow,
  onClose,
}: {
  refRow: ClientPatternFabricRef;
  onClose: () => void;
}) {
  const getSwatch = useFabricSwatch();
  const urls = refRow.supplier_id
    ? getSwatch?.(refRow.supplier_id, refRow.fabric_number)
    : undefined;
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
      aria-label={`Fabric ${refRow.fabric_number}`}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-lg font-bold text-slate-900">{refRow.fabric_number}</p>
            <p className="mt-0.5 text-sm text-slate-600">{refRow.supplier_name ?? "Catalog"}</p>
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
            aria-label={`No photo for fabric ${refRow.fabric_number}`}
          >
            <ImageOff className="h-8 w-8" />
            <p className="text-sm font-medium text-slate-500">No photo</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Fabric ${refRow.fabric_number}`}
              className="mx-auto max-h-64 w-full object-contain"
              onError={() => setFailed(true)}
            />
          </div>
        )}
        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Composition</dt>
            <dd className="text-right text-slate-800">{refRow.composition ?? "-"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Weight</dt>
            <dd className="text-right text-slate-800">
              {refRow.weight_gsm != null ? `${refRow.weight_gsm} gsm` : "-"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Width</dt>
            <dd className="text-right text-slate-800">
              {refRow.width_cm != null ? `${refRow.width_cm} cm` : "-"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Color</dt>
            <dd className="text-right text-slate-800">{refRow.color ?? "-"}</dd>
          </div>
        </dl>
      </div>
    </div>
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
            <dd className="text-right text-slate-800">{row.composition ?? "-"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Color</dt>
            <dd className="text-right text-slate-800">{row.color ?? "-"}</dd>
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
