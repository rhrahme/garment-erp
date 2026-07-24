"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Printer, Trash2 } from "lucide-react";
import { MeasurementInput } from "@/components/pattern/library/MeasurementInput";
import { LibraryFileList } from "@/components/pattern/library/LibraryFileList";
import { unitLabel } from "@/lib/pattern-library/measurements";
import type { BasePattern, BasePatternPoint } from "@/lib/types/pattern-library";
import { cn } from "@/lib/utils";

export function BasePatternDetail({ baseId }: { baseId: string }) {
  const [base, setBase] = useState<BasePattern | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPointName, setNewPointName] = useState("");
  const [newSize, setNewSize] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pattern/library/bases/${baseId}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setBase(data.base);
      setDirty(false);
    } catch {
      setBase(null);
    } finally {
      setLoading(false);
    }
  }, [baseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const gradedPoints = useMemo(() => base?.points.filter((point) => point.is_graded) ?? [], [base]);
  const trimPoints = useMemo(() => base?.points.filter((point) => !point.is_graded) ?? [], [base]);

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
      setBase(data.base);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading base pattern…</p>;
  if (!base) return <p className="text-sm text-rose-600">Base pattern not found.</p>;

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
          <Link
            href={`/pattern/bases/${base.id}/print`}
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
              {base.cut_variant ? ` · ${base.cut_variant}` : ""} · {unitLabel(base.unit)}
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
          <div className="text-right text-xs text-slate-500">
            <p>
              {base.sizes.length} sizes · {base.points.length} points
            </p>
            <p className="mt-1">Updated {new Date(base.updated_at).toLocaleDateString()}</p>
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
            Size grid <span className="font-normal text-slate-500">({unitLabel(base.unit)})</span>
          </p>
          <div className="flex items-center gap-1.5">
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
                {base.sizes.map((size) => (
                  <th key={size} className="px-1.5 py-2 text-center font-semibold">
                    {size}
                  </th>
                ))}
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
                  {base.sizes.map((size) => (
                    <td key={size} className="px-0.5 py-1 text-center">
                      <MeasurementInput
                        value={point.values[size] ?? null}
                        unit={base.unit}
                        onCommit={(value) => setCell(point.point_id, size, value)}
                      />
                    </td>
                  ))}
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
                          unit={base.unit}
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
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <LibraryFileList
            files={base.files}
            uploadUrl={`/api/pattern/library/bases/${base.id}/files`}
            downloadUrlBase={`/api/pattern/library/bases/${base.id}/files`}
            onUploaded={() => void load()}
            title="Base pattern files (.TUD, Excel, DXF, PDF, images)"
          />
        </div>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
