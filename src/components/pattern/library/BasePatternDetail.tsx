"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Printer, Trash2, UserPlus, X } from "lucide-react";
import { MeasurementInput } from "@/components/pattern/library/MeasurementInput";
import { MeasurementUnitToggle } from "@/components/pattern/library/MeasurementUnitToggle";
import { LibraryFileList } from "@/components/pattern/library/LibraryFileList";
import { PatternQrBadge } from "@/components/pattern/library/PatternQrBadge";
import { useMeasurementUnitPreference } from "@/hooks/useMeasurementUnitPreference";
import { invalidateBasePickerCache } from "@/lib/pattern-library/base-picker-cache";
import {
  clientColumnDelta,
  clientColumnHeaderLabel,
  orderedGridColumns,
} from "@/lib/pattern-library/client-fit-columns";
import { withMeasurementUnitParam } from "@/lib/pattern-library/measurement-unit-preference";
import {
  formatMeasurementForDisplay,
  unitLabel,
} from "@/lib/pattern-library/measurements";
import { basePatternLabelCode, basePatternQrUrl } from "@/lib/pattern-library/pattern-qr";
import type {
  BasePattern,
  BasePatternClientColumn,
  BasePatternPoint,
} from "@/lib/types/pattern-library";
import { cn } from "@/lib/utils";

interface FitClientOption {
  id: string;
  code: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
}

function fitClientName(client: FitClientOption): string {
  return [client.first_name, client.middle_name, client.last_name].filter(Boolean).join(" ");
}

export function BasePatternDetail({ baseId }: { baseId: string }) {
  const { unit: displayUnit } = useMeasurementUnitPreference();
  const [base, setBase] = useState<BasePattern | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPointName, setNewPointName] = useState("");
  const [newSize, setNewSize] = useState("");
  const [clients, setClients] = useState<FitClientOption[]>([]);
  /** Client picked in the "client fit column" selector (empty = control idle). */
  const [fitClientId, setFitClientId] = useState("");
  /** Client ids whose fit column changed locally and needs a PUT on save. */
  const [pendingFitClientIds, setPendingFitClientIds] = useState<Set<string>>(new Set());
  /** Client ids whose fit column was removed locally and needs a DELETE on save. */
  const [removedFitClientIds, setRemovedFitClientIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pattern/library/bases/${baseId}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setBase(data.base);
      setDirty(false);
      setPendingFitClientIds(new Set());
      setRemovedFitClientIds(new Set());
    } catch {
      setBase(null);
    } finally {
      setLoading(false);
    }
  }, [baseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch("/api/clients", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setClients(data?.clients ?? []))
      .catch(() => setClients([]));
  }, []);

  // Deep links from a client context (?client=<id>) preselect the fit picker.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("client");
    if (fromUrl) setFitClientId(fromUrl);
  }, []);

  const gradedPoints = useMemo(() => base?.points.filter((point) => point.is_graded) ?? [], [base]);
  const trimPoints = useMemo(() => base?.points.filter((point) => !point.is_graded) ?? [], [base]);

  /** Size + client fit columns in display order (client column follows its base size). */
  const gridColumns = useMemo(
    () => (base ? orderedGridColumns(base.sizes, base.client_columns) : []),
    [base]
  );
  const fitClient = clients.find((candidate) => candidate.id === fitClientId) ?? null;
  const fitClientColumn =
    base?.client_columns?.find((column) => column.client_id === fitClientId) ?? null;

  function mutate(updater: (draft: BasePattern) => BasePattern) {
    setBase((current) => (current ? updater(current) : current));
    setDirty(true);
  }

  function setCell(pointId: string, size: string, value: number | null) {
    mutate((draft) => ({
      ...draft,
      points: draft.points.map((point) =>
        point.point_id === pointId ? { ...point, values: { ...point.values, [size]: value } } : point
      ),
    }));
  }

  function setPointField(pointId: string, patch: Partial<BasePatternPoint>) {
    mutate((draft) => ({
      ...draft,
      points: draft.points.map((point) =>
        point.point_id === pointId ? { ...point, ...patch } : point
      ),
    }));
  }

  function removePoint(pointId: string) {
    mutate((draft) => ({
      ...draft,
      points: draft.points.filter((point) => point.point_id !== pointId),
    }));
  }

  function addPoint() {
    const name = newPointName.trim();
    if (!name || !base) return;
    const pointId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (base.points.some((point) => point.point_id === pointId)) return;
    mutate((draft) => ({
      ...draft,
      points: [
        ...draft.points,
        {
          point_id: pointId,
          name,
          remark: null,
          is_graded: true,
          tolerance: null,
          grading_increment: null,
          diagram_code: null,
          values: Object.fromEntries(draft.sizes.map((size) => [size, null])),
        },
      ],
    }));
    setNewPointName("");
  }

  function addSize() {
    const size = newSize.trim();
    if (!size || !base || base.sizes.includes(size)) return;
    mutate((draft) => ({
      ...draft,
      sizes: [...draft.sizes, size],
      points: draft.points.map((point) => ({
        ...point,
        values: { ...point.values, [size]: null },
      })),
    }));
    setNewSize("");
  }

  function markFitColumnPending(clientId: string) {
    setPendingFitClientIds((current) => new Set(current).add(clientId));
    setRemovedFitClientIds((current) => {
      if (!current.has(clientId)) return current;
      const next = new Set(current);
      next.delete(clientId);
      return next;
    });
  }

  /** Anchor (or re-anchor) the selected client's fit column to this size. */
  function anchorFitColumnToSize(size: string) {
    if (!fitClient) return;
    const clientId = fitClient.id;
    const timestamp = new Date().toISOString();
    mutate((draft) => {
      const columns = draft.client_columns ?? [];
      const existing = columns.find((column) => column.client_id === clientId) ?? null;
      const column: BasePatternClientColumn = existing
        ? { ...existing, base_size: size, updated_at: timestamp }
        : {
            id: `bpcc-local-${Date.now()}`,
            client_id: clientId,
            client_code: fitClient.code || null,
            client_name: fitClientName(fitClient),
            base_size: size,
            values: {},
            created_by: null,
            updated_by: null,
            created_at: timestamp,
            updated_at: timestamp,
          };
      return {
        ...draft,
        client_columns: existing
          ? columns.map((candidate) => (candidate.client_id === clientId ? column : candidate))
          : [...columns, column],
      };
    });
    markFitColumnPending(clientId);
  }

  function setClientCell(clientId: string, pointId: string, value: number | null) {
    mutate((draft) => ({
      ...draft,
      client_columns: (draft.client_columns ?? []).map((column) =>
        column.client_id === clientId
          ? { ...column, values: { ...column.values, [pointId]: value } }
          : column
      ),
    }));
    markFitColumnPending(clientId);
  }

  function removeFitColumn(clientId: string) {
    mutate((draft) => ({
      ...draft,
      client_columns: (draft.client_columns ?? []).filter(
        (column) => column.client_id !== clientId
      ),
    }));
    setPendingFitClientIds((current) => {
      if (!current.has(clientId)) return current;
      const next = new Set(current);
      next.delete(clientId);
      return next;
    });
    setRemovedFitClientIds((current) => new Set(current).add(clientId));
  }

  async function save() {
    if (!base) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/library/bases/${baseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sizes: base.sizes,
          points: base.points,
          special_instructions: base.special_instructions,
          physical_pattern_kept: base.physical_pattern_kept,
          physical_pattern_location: base.physical_pattern_location,
          notes: base.notes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save.");
      }
      const data = await res.json();

      // Client fit columns persist through their own endpoint (Zapier parity).
      for (const clientId of removedFitClientIds) {
        const del = await fetch(
          `/api/pattern/library/bases/${baseId}/client-columns?client_id=${encodeURIComponent(clientId)}`,
          { method: "DELETE" }
        );
        // 404 = the column was never saved server-side; nothing to remove.
        if (!del.ok && del.status !== 404) {
          const body = await del.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to remove client fit column.");
        }
      }
      for (const clientId of pendingFitClientIds) {
        const column = base.client_columns?.find(
          (candidate) => candidate.client_id === clientId
        );
        if (!column) continue;
        const put = await fetch(`/api/pattern/library/bases/${baseId}/client-columns`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: column.client_id,
            client_code: column.client_code,
            client_name: column.client_name,
            base_size: column.base_size,
            values: column.values,
          }),
        });
        if (!put.ok) {
          const body = await put.json().catch(() => null);
          throw new Error(body?.error ?? "Failed to save client fit column.");
        }
      }

      if (removedFitClientIds.size > 0 || pendingFitClientIds.size > 0) {
        await load();
      } else {
        setBase(data.base);
        setDirty(false);
      }
      // Grids/sizes/client columns changed - pickers must not serve stale data.
      invalidateBasePickerCache();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading base pattern…</p>;
  if (!base) return <p className="text-sm text-rose-600">Base pattern not found.</p>;

  const storedUnit = base.unit;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/pattern/library"
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Pattern library
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <MeasurementUnitToggle disabled={saving} />
          <Link
            href={withMeasurementUnitParam(`/pattern/bases/${base.id}/print`, displayUnit)}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print A4
          </Link>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium",
              dirty
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-slate-100 text-slate-400"
            )}
          >
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">{base.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {base.house_brand_code} · {base.cut_family} · {base.garment_type}
              {base.cut_variant ? ` · ${base.cut_variant}` : ""} · {unitLabel(displayUnit)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {[
                base.fabric ? `Fabric: ${base.fabric}` : null,
                base.style_code ? `Style ${base.style_code}` : null,
                base.season,
                base.source_file ? `Imported from ${base.source_file}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="text-right text-xs text-slate-500">
              <p>
                {base.sizes.length} sizes · {base.points.length} points
              </p>
              <p className="mt-1">Updated {new Date(base.updated_at).toLocaleDateString()}</p>
            </div>
            <PatternQrBadge payload={basePatternQrUrl(base.id)} label={basePatternLabelCode(base)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={base.physical_pattern_kept}
              onChange={(e) => mutate((draft) => ({ ...draft, physical_pattern_kept: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="text-slate-700">Physical pattern kept</span>
          </label>
          {base.physical_pattern_kept ? (
            <input
              value={base.physical_pattern_location ?? ""}
              onChange={(e) =>
                mutate((draft) => ({ ...draft, physical_pattern_location: e.target.value || null }))
              }
              placeholder="Location (shelf / drawer note)"
              className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-800">
            Size grid <span className="font-normal text-slate-500">({unitLabel(displayUnit)})</span>
            <span className="ml-2 text-xs font-normal text-slate-400">
              Tap a size to open its A4 working sheet
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1.5 rounded-lg bg-indigo-50/70 px-2 py-1 ring-1 ring-indigo-100">
              <UserPlus className="h-4 w-4 shrink-0 text-indigo-600" />
              <select
                value={fitClientId}
                onChange={(e) => setFitClientId(e.target.value)}
                className="max-w-52 rounded-md border border-indigo-200 bg-white px-2 py-1 text-sm"
                aria-label="Client fit column"
              >
                <option value="">Client fit column...</option>
                {clients.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.code} - {fitClientName(option)}
                  </option>
                ))}
              </select>
              {fitClient && !fitClientColumn ? (
                <span className="text-xs text-indigo-700">
                  now tap &quot;Use as base&quot; under a size
                </span>
              ) : null}
            </div>
            <input
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              placeholder="Add size"
              className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              onKeyDown={(e) => e.key === "Enter" && addSize()}
            />
            <button
              type="button"
              onClick={addSize}
              className="rounded-lg bg-white p-1.5 text-indigo-700 ring-1 ring-slate-200 hover:bg-slate-50"
              aria-label="Add size"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Measurement point</th>
                {gridColumns.map((entry) =>
                  entry.kind === "size" ? (
                    <th key={`size-${entry.size}`} className="px-0.5 py-1 text-center font-semibold">
                      <Link
                        href={withMeasurementUnitParam(
                          `/pattern/bases/${base.id}/sizes/${encodeURIComponent(entry.size)}/print`,
                          displayUnit
                        )}
                        target="_blank"
                        title={`Open A4 working sheet for size ${entry.size}`}
                        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg px-2 py-1.5 text-indigo-700 underline decoration-indigo-300 decoration-dotted underline-offset-2 hover:bg-indigo-50 hover:text-indigo-900"
                      >
                        {entry.size}
                      </Link>
                      {fitClient && fitClientColumn?.base_size !== entry.size ? (
                        <button
                          type="button"
                          onClick={() => anchorFitColumnToSize(entry.size)}
                          title={`Use ${entry.size} as base size for ${fitClientName(fitClient)}`}
                          className="mx-auto block whitespace-nowrap rounded-md bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-white hover:bg-indigo-700"
                        >
                          Use as base
                        </button>
                      ) : null}
                    </th>
                  ) : (
                    <th
                      key={`client-${entry.column.client_id}`}
                      className="bg-amber-50 px-1 py-1 text-center align-top font-semibold text-amber-900"
                    >
                      <span className="flex items-center justify-center gap-1 whitespace-nowrap px-1 pt-1.5">
                        <span title={`${entry.column.client_name} - adjusted from size ${entry.column.base_size}`}>
                          {clientColumnHeaderLabel(entry.column)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFitColumn(entry.column.client_id)}
                          title={`Remove ${entry.column.client_name}'s fit column`}
                          aria-label={`Remove ${entry.column.client_name}'s fit column`}
                          className="rounded p-0.5 text-amber-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                      <Link
                        href={withMeasurementUnitParam(
                          `/pattern/bases/${base.id}/sizes/${encodeURIComponent(entry.column.base_size)}/print?client=${encodeURIComponent(entry.column.client_id)}`,
                          displayUnit
                        )}
                        target="_blank"
                        className="block pb-1 text-[10px] font-normal normal-case tracking-normal text-amber-700 underline decoration-dotted underline-offset-2 hover:text-amber-900"
                      >
                        A4 sheet
                      </Link>
                    </th>
                  )
                )}
                <th className="px-3 py-2">Remarks</th>
                <th className="w-8 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {gradedPoints.map((point) => (
                <tr key={point.point_id} className="border-b border-slate-100">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5 font-medium text-slate-800">
                    {point.name}
                  </td>
                  {gridColumns.map((entry) => {
                    if (entry.kind === "size") {
                      return (
                        <td key={`size-${entry.size}`} className="px-0.5 py-1 text-center">
                          <MeasurementInput
                            value={point.values[entry.size] ?? null}
                            unit={storedUnit}
                            displayUnit={displayUnit}
                            onCommit={(value) => setCell(point.point_id, entry.size, value)}
                          />
                        </td>
                      );
                    }
                    const column = entry.column;
                    const baseValue = point.values[column.base_size] ?? null;
                    const clientValue = column.values[point.point_id] ?? null;
                    const delta = clientColumnDelta(baseValue, clientValue);
                    return (
                      <td
                        key={`client-${column.client_id}`}
                        className="bg-amber-50/60 px-0.5 py-1 text-center"
                      >
                        <MeasurementInput
                          value={clientValue}
                          unit={storedUnit}
                          displayUnit={displayUnit}
                          placeholder={
                            baseValue !== null
                              ? formatMeasurementForDisplay(baseValue, storedUnit, displayUnit)
                              : "—"
                          }
                          onCommit={(value) =>
                            setClientCell(column.client_id, point.point_id, value)
                          }
                          className="border-amber-200 bg-white placeholder:text-amber-300 focus:border-amber-500"
                        />
                        <p className="h-3 text-[10px] leading-3 text-amber-600">
                          {delta !== null
                            ? `${delta > 0 ? "+" : "-"}${formatMeasurementForDisplay(
                                Math.abs(delta),
                                storedUnit,
                                displayUnit
                              )}`
                            : "\u00a0"}
                        </p>
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5">
                    <input
                      value={point.remark ?? ""}
                      onChange={(e) => setPointField(point.point_id, { remark: e.target.value || null })}
                      className="w-32 rounded-md border border-transparent px-1.5 py-1 text-xs text-slate-600 hover:border-slate-200 focus:border-indigo-300 focus:outline-none"
                      placeholder="—"
                    />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => removePoint(point.point_id)}
                      className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Remove ${point.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-3">
          <input
            value={newPointName}
            onChange={(e) => setNewPointName(e.target.value)}
            placeholder="Add measurement point…"
            className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            onKeyDown={(e) => e.key === "Enter" && addPoint()}
          />
          <button
            type="button"
            onClick={addPoint}
            className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Add point
          </button>
        </div>
      </div>

      {trimPoints.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">
              Trims <span className="font-normal text-slate-500">(constant across sizes)</span>
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Point</th>
                  <th className="px-3 py-2 text-center">Value</th>
                  {base.points.some((p) => p.tolerance !== null) ? (
                    <th className="px-3 py-2 text-center">Tol ±</th>
                  ) : null}
                  <th className="px-3 py-2">Remarks</th>
                  <th className="w-8 px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {trimPoints.map((point) => {
                  const firstValue =
                    Object.values(point.values).find((value) => value !== null) ?? null;
                  return (
                    <tr key={point.point_id} className="border-b border-slate-100">
                      <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-800">
                        {point.name}
                        {point.diagram_code ? (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                            {point.diagram_code}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-1 text-center">
                        <MeasurementInput
                          value={firstValue}
                          unit={storedUnit}
                          displayUnit={displayUnit}
                          onCommit={(value) =>
                            setPointField(point.point_id, {
                              values: Object.fromEntries(base.sizes.map((size) => [size, value])),
                            })
                          }
                        />
                      </td>
                      {base.points.some((p) => p.tolerance !== null) ? (
                        <td className="px-3 py-1.5 text-center text-xs text-slate-500">
                          {point.tolerance ?? "—"}
                        </td>
                      ) : null}
                      <td className="px-3 py-1.5">
                        <input
                          value={point.remark ?? ""}
                          onChange={(e) =>
                            setPointField(point.point_id, { remark: e.target.value || null })
                          }
                          className="w-40 rounded-md border border-transparent px-1.5 py-1 text-xs text-slate-600 hover:border-slate-200 focus:border-indigo-300 focus:outline-none"
                          placeholder="—"
                        />
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removePoint(point.point_id)}
                          className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                          aria-label={`Remove ${point.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-slate-700">Special instructions</p>
          <textarea
            value={base.special_instructions ?? ""}
            onChange={(e) =>
              mutate((draft) => ({ ...draft, special_instructions: e.target.value || null }))
            }
            rows={3}
            placeholder="e.g. 2 pleat at slv"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mb-2 mt-3 text-sm font-semibold text-slate-700">Notes</p>
          <textarea
            value={base.notes ?? ""}
            onChange={(e) => mutate((draft) => ({ ...draft, notes: e.target.value || null }))}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <LibraryFileList
              files={base.files.filter((file) => file.kind === "dxf")}
              uploadUrl={`/api/pattern/library/bases/${base.id}/files`}
              downloadUrlBase={`/api/pattern/library/bases/${base.id}/files`}
              onUploaded={() => void load()}
              title="DXF cut outlines (.dxf)"
              accept=".dxf,.DXF"
              emptyLabel="No .DXF yet. Upload cut outlines when this base is used for real nest layouts."
              uploadLabel="Upload .DXF"
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <LibraryFileList
              files={base.files.filter((file) => file.kind !== "dxf")}
              uploadUrl={`/api/pattern/library/bases/${base.id}/files`}
              downloadUrlBase={`/api/pattern/library/bases/${base.id}/files`}
              onUploaded={() => void load()}
              title="Base pattern files (.TUD, Excel, RUL, PDF, images)"
              accept=".tud,.xlsx,.xls,.rul,.pdf,.png,.jpg,.jpeg,.webp,.heic"
              emptyLabel="No other files yet — .TUD, Excel, RUL, PDF, images."
            />
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
