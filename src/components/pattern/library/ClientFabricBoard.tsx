"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Eye, ImageOff, Layers, Scissors, X } from "lucide-react";
import { FabricSwatchPreview } from "@/components/fabric/FabricSwatchPreview";
import { FabricSwatchProvider, useFabricSwatch } from "@/components/fabric/FabricSwatchProvider";
import { BasePatternCascadePicker } from "@/components/pattern/library/BasePatternCascadePicker";
import {
  cascadeSelectionReady,
  emptyCascadeValue,
  preferredBrandCodeFromClientCode,
  type BasePatternCascadeValue,
} from "@/lib/pattern-library/base-pattern-picker";
import type {
  ClientFabricBoard as ClientFabricBoardData,
  ClientFabricBoardRow,
  ClientFabricStatus,
} from "@/lib/pattern-library/client-fabric-board";
import type { BasePattern } from "@/lib/types/pattern-library";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<ClientFabricStatus, string> = {
  on_order: "bg-slate-100 text-slate-600",
  received: "bg-sky-100 text-sky-800",
  washing: "bg-blue-100 text-blue-800",
  drying: "bg-cyan-100 text-cyan-800",
  ironing: "bg-amber-100 text-amber-800",
  ready: "bg-emerald-100 text-emerald-800",
};

/** Garments the pattern team groups fabrics into — incl. Polo / T-shirt. */
const BASE_GARMENTS = [
  "jacket",
  "shirt",
  "long sleeve shirt",
  "short sleeve shirt",
  "polo",
  "t-shirt",
  "trouser",
  "shorts",
  "suit",
  "vest",
  "overshirt",
  "overcoat",
  "thobe",
];

type AssignFilter = "all" | "unassigned" | "assigned";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function specsLine(row: ClientFabricBoardRow): string {
  const width =
    row.width_cm != null ? `${row.width_cm} cm` : row.width_inches != null ? `${row.width_inches}"` : null;
  return [
    row.composition,
    row.weight_gsm != null ? `${row.weight_gsm} gsm` : null,
    width,
    row.color,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ClientFabricBoard({ clientId }: { clientId: string }) {
  const [board, setBoard] = useState<ClientFabricBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<AssignFilter>("all");
  const [detailLineId, setDetailLineId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; patternId?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pattern/library/client-fabrics/${clientId}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      setBoard(await res.json());
    } catch {
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!board) return [];
    if (filter === "unassigned") return board.rows.filter((row) => !row.assigned_pattern);
    if (filter === "assigned") return board.rows.filter((row) => row.assigned_pattern);
    return board.rows;
  }, [board, filter]);

  /** Rows grouped by sales order, newest SO first (board rows are pre-sorted). */
  const orderGroups = useMemo(() => {
    const groups: { so_number: string; order_date: string; rows: ClientFabricBoardRow[] }[] = [];
    for (const row of rows) {
      const last = groups[groups.length - 1];
      if (last && last.so_number === row.so_number) last.rows.push(row);
      else groups.push({ so_number: row.so_number, order_date: row.order_date, rows: [row] });
    }
    return groups;
  }, [rows]);

  const swatchKeys = useMemo(
    () =>
      (board?.rows ?? []).map((row) => ({
        supplier_id: row.supplier_id,
        fabric_number: row.fabric_number,
      })),
    [board]
  );

  const detailRow = useMemo(
    () => board?.rows.find((row) => row.line_id === detailLineId) ?? null,
    [board, detailLineId]
  );

  function toggleSelected(lineId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  async function unassign(row: ClientFabricBoardRow) {
    if (!row.assigned_pattern) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/pattern/library/client-patterns/${row.assigned_pattern.pattern_id}/fabric-lines`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ line_ids: [row.line_id] }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to remove fabric from pattern.");
      }
      setNotice({ text: `${row.article_code} removed from ${row.assigned_pattern.pattern_ref}.` });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove fabric from pattern.");
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading client fabrics…</p>;
  if (!board) return <p className="text-sm text-rose-600">Failed to load client fabrics.</p>;

  const selectedRows = board.rows.filter((row) => selected.has(row.line_id));

  return (
    <FabricSwatchProvider fabrics={swatchKeys}>
      <div className="space-y-4 pb-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/pattern/library"
            className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Pattern library
          </Link>
          <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-800">
            {board.summary.assigned}/{board.summary.total} assigned to a garment
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {board.client.name || "Client"}{" "}
                <span className="text-sm font-normal text-slate-400">({board.client.code})</span>
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Tick fabrics, then assign them to a garment — new pattern or an existing one.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "all", label: `All (${board.rows.length})` },
                  {
                    id: "unassigned",
                    label: `Unassigned (${board.summary.total - board.summary.assigned})`,
                  },
                  { id: "assigned", label: `Assigned (${board.summary.assigned})` },
                ] as { id: AssignFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    filter === tab.id
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {notice ? (
          <p className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice.text}
            {notice.patternId ? (
              <Link
                href={`/pattern/library/clients/${notice.patternId}`}
                className="inline-flex items-center gap-1 font-medium text-emerald-900 underline"
              >
                Open pattern (upload .TUD / sizes)
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </p>
        ) : null}
        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        {orderGroups.map((group) => (
          <div key={group.so_number} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {group.so_number}
              <span className="ml-2 font-normal normal-case text-slate-400">
                ordered {formatDate(group.order_date)} · {group.rows.length} fabric
                {group.rows.length === 1 ? "" : "s"}
              </span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.rows.map((row) => (
                <FabricCard
                  key={row.line_id}
                  row={row}
                  checked={selected.has(row.line_id)}
                  onToggle={() => toggleSelected(row.line_id)}
                  onOpen={() => setDetailLineId(row.line_id)}
                />
              ))}
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            {board.rows.length === 0
              ? "No fabric articles on this client's sales orders yet."
              : "No fabrics match this filter."}
          </p>
        ) : null}

        {/* Sticky multi-select action bar — big targets for tablet. */}
        {selected.size > 0 ? (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-4px_12px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-700">
                {selected.size} fabric{selected.size === 1 ? "" : "s"} selected
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="ml-3 text-xs font-medium text-slate-500 underline hover:text-slate-700"
                >
                  Clear
                </button>
              </p>
              <button
                type="button"
                onClick={() => {
                  setNotice(null);
                  setAssignOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <Scissors className="h-4 w-4" />
                Assign to garment / pattern
              </button>
            </div>
          </div>
        ) : null}

        {assignOpen ? (
          <AssignDialog
            board={board}
            selectedRows={selectedRows}
            onClose={() => setAssignOpen(false)}
            onDone={async (message, patternId) => {
              setAssignOpen(false);
              setSelected(new Set());
              setNotice({ text: message, patternId });
              await load();
            }}
          />
        ) : null}

        {detailRow ? (
          <FabricDetailDialog
            row={detailRow}
            onClose={() => setDetailLineId(null)}
            onUnassign={async () => {
              setDetailLineId(null);
              await unassign(detailRow);
            }}
          />
        ) : null}
      </div>
    </FabricSwatchProvider>
  );
}

function FabricCard({
  row,
  checked,
  onToggle,
  onOpen,
}: {
  row: ClientFabricBoardRow;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border bg-white p-3 shadow-sm transition-colors",
        checked ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-indigo-300"
      )}
    >
      <label className="flex shrink-0 cursor-pointer items-start pt-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-5 w-5 rounded border-slate-300"
          aria-label={`Select fabric ${row.article_code}`}
        />
      </label>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          {/* Swatch outside the card button so zoom/preview clicks don't nest <button>s. */}
          <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
            <FabricSwatchPreview
              supplierId={row.supplier_id}
              fabricNumber={row.fabric_number}
              className="!h-14 !w-14 rounded-lg [&_img]:!h-full [&_img]:!w-full [&_svg]:!h-5 [&_svg]:!w-5"
            />
          </div>
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-sm font-bold text-slate-900">{row.article_code}</p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                  STATUS_STYLES[row.status]
                )}
              >
                {row.status_label}
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm text-slate-700">
              <span className="font-mono">{row.fabric_number}</span> · {row.supplier_name}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{specsLine(row) || "No specs"}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {row.garment_type} · {row.meters} {row.unit}
            </p>
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
            title={`Preview ${row.article_code}`}
            aria-label={`Preview fabric ${row.article_code}`}
          >
            <Eye className="h-4 w-4" />
          </button>
        </div>
        <button type="button" onClick={onOpen} className="mt-2 block w-full text-left">
          {row.assigned_pattern ? (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800">
              <Layers className="h-3 w-3 shrink-0" />
              {row.assigned_pattern.garment_type} · {row.assigned_pattern.pattern_ref}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-dashed border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              Unassigned
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function AssignDialog({
  board,
  selectedRows,
  onClose,
  onDone,
}: {
  board: ClientFabricBoardData;
  selectedRows: ClientFabricBoardRow[];
  onClose: () => void;
  onDone: (message: string, patternId?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"new" | "existing">(board.patterns.length > 0 ? "existing" : "new");
  const [patternId, setPatternId] = useState(board.patterns[0]?.id ?? "");
  const [bases, setBases] = useState<BasePattern[]>([]);
  const [cascade, setCascade] = useState<BasePatternCascadeValue>(() =>
    emptyCascadeValue(preferredBrandCodeFromClientCode(board.client.code))
  );
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pattern/library", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBases(data?.base_patterns ?? []))
      .catch(() => setBases([]));
  }, []);

  const garments = useMemo(
    () =>
      [...new Set([...BASE_GARMENTS, ...board.patterns.map((pattern) => pattern.garment_type)])].sort(),
    [board.patterns]
  );

  const lineIds = selectedRows.map((row) => row.line_id);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "existing") {
        const target = board.patterns.find((pattern) => pattern.id === patternId);
        if (!target) throw new Error("Choose a pattern.");
        const res = await fetch(`/api/pattern/library/client-patterns/${target.id}/fabric-lines`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ line_ids: lineIds }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to assign fabrics.");
        }
        await onDone(
          `${lineIds.length} fabric${lineIds.length === 1 ? "" : "s"} assigned to ${target.pattern_ref}.`,
          target.id
        );
        return;
      }

      if (!cascadeSelectionReady(cascade)) {
        throw new Error(
          cascade.origin === "library"
            ? "Choose garment, library base, and size."
            : "Choose a garment type."
        );
      }
      const res = await fetch("/api/pattern/library/client-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: board.client.id,
          client_code: board.client.code,
          client_name: board.client.name,
          garment_type: cascade.garmentType,
          base_pattern_id:
            cascade.origin === "library" ? cascade.basePatternId || null : null,
          base_size: cascade.origin === "library" ? cascade.baseSize || null : null,
          description: description || null,
          linked_fabric_line_ids: lineIds,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to create pattern.");
      }
      const data = await res.json();
      await onDone(
        `New ${cascade.garmentType} pattern created with ${lineIds.length} fabric${lineIds.length === 1 ? "" : "s"}.`,
        data.pattern?.id
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign fabrics.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Assign fabrics to garment"
    >
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">
            Assign {selectedRows.length} fabric{selectedRows.length === 1 ? "" : "s"} to a garment
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ul className="mt-3 flex flex-wrap gap-1.5">
          {selectedRows.map((row) => (
            <li
              key={row.line_id}
              className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs font-medium text-slate-700"
            >
              {row.article_code}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("existing")}
            disabled={board.patterns.length === 0}
            className={cn(
              "flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-40",
              mode === "existing"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200"
            )}
          >
            Existing pattern
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={cn(
              "flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              mode === "new" ? "bg-indigo-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
            )}
          >
            New pattern
          </button>
        </div>

        {mode === "existing" ? (
          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Client pattern</span>
            <select
              value={patternId}
              onChange={(e) => setPatternId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              {board.patterns.map((pattern) => (
                <option key={pattern.id} value={pattern.id}>
                  {pattern.pattern_ref} — {pattern.garment_type}
                  {pattern.linked_line_count > 0 ? ` (${pattern.linked_line_count} fabrics)` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="mt-4 space-y-3">
            <BasePatternCascadePicker
              bases={bases}
              extraGarments={garments}
              value={cascade}
              onChange={setCascade}
            />
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                Description (optional) — e.g. “long sleeve shirts”
              </span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>
            <p className="text-xs text-slate-400">
              Creates the client pattern — upload the .TUD on the pattern page as usual.
            </p>
          </div>
        )}

        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Assigning…" : mode === "existing" ? "Assign fabrics" : "Create pattern + assign"}
        </button>
      </div>
    </div>
  );
}

function FabricDetailPhoto({
  supplierId,
  fabricNumber,
}: {
  supplierId: string;
  fabricNumber: string;
}) {
  const getSwatch = useFabricSwatch();
  const urls = getSwatch?.(supplierId, fabricNumber);
  const src = urls?.zoom ?? urls?.square;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400"
        aria-label={`No photo for fabric ${fabricNumber}`}
      >
        <ImageOff className="h-8 w-8" />
        <p className="text-sm font-medium text-slate-500">No photo</p>
        <p className="text-xs text-slate-400">No swatch image for {fabricNumber}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Fabric ${fabricNumber}`}
        className="mx-auto max-h-72 w-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function FabricDetailDialog({
  row,
  onClose,
  onUnassign,
}: {
  row: ClientFabricBoardRow;
  onClose: () => void;
  onUnassign: () => Promise<void>;
}) {
  const history: { label: string; at: string | null }[] = [
    { label: "Received at factory", at: row.received_at },
    { label: `${row.prep_type === "soak_iron" ? "Soak" : "Wash"} started`, at: row.wash_started_at },
    { label: "Hung to dry", at: row.dry_started_at },
    { label: "Ironing started", at: row.iron_started_at },
    { label: "Ironing done", at: row.iron_done_at },
    { label: "Handed off (ready to cut)", at: row.handed_off_at },
  ];

  const specs: { label: string; value: string }[] = [
    { label: "Sales order", value: row.so_number },
    { label: "Article", value: row.article_code },
    { label: "Garment to stitch", value: row.garment_type },
    { label: "Supplier", value: row.supplier_name },
    { label: "Fabric number", value: row.fabric_number },
    { label: "Composition", value: row.composition ?? "—" },
    { label: "Weight", value: row.weight_gsm != null ? `${row.weight_gsm} gsm` : "—" },
    {
      label: "Width",
      value:
        row.width_cm != null ? `${row.width_cm} cm` : row.width_inches != null ? `${row.width_inches}"` : "—",
    },
    { label: "Color", value: row.color ?? "—" },
    { label: "Meters", value: `${row.meters} ${row.unit}` },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Fabric ${row.article_code}`}
    >
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-lg font-bold text-slate-900">{row.article_code}</p>
            <span
              className={cn(
                "mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                STATUS_STYLES[row.status]
              )}
            >
              {row.status_label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <FabricDetailPhoto supplierId={row.supplier_id} fabricNumber={row.fabric_number} />

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {specs.map((spec) => (
            <div key={spec.label} className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-xs font-medium text-slate-500">{spec.label}</dt>
              <dd className="mt-0.5 font-medium text-slate-800">{spec.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-slate-800">Receiving &amp; prep history</p>
          {row.status === "on_order" ? (
            <p className="text-sm text-slate-500">Not received yet — fabric is still on order.</p>
          ) : (
            <ol className="space-y-1.5">
              {history.map((step) => (
                <li key={step.label} className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      step.at ? "bg-emerald-500" : "bg-slate-200"
                    )}
                  />
                  <span className={step.at ? "text-slate-800" : "text-slate-400"}>{step.label}</span>
                  <span className="ml-auto text-xs tabular-nums text-slate-500">
                    {formatDateTime(step.at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Garment group</p>
          {row.assigned_pattern ? (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/pattern/library/clients/${row.assigned_pattern.pattern_id}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline"
              >
                <Layers className="h-4 w-4" />
                {row.assigned_pattern.garment_type} · {row.assigned_pattern.pattern_ref}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => void onUnassign()}
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
              >
                Remove from this pattern
              </button>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-slate-500">
              Not assigned yet — tick it on the board and use “Assign to garment / pattern”.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
