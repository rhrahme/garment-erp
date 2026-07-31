"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, Ruler } from "lucide-react";
import { evaluatePatternCuttingCompleteness } from "@/lib/pattern-library/cutting-completeness";
import {
  collectNestTudMetadata,
  estimateNestFromTud,
  type NestEstimateResult,
} from "@/lib/pattern-library/nest-estimate";
import { tudFabricLabel } from "@/lib/pattern-library/tud-display";
import type { ClientPattern } from "@/lib/types/pattern-library";

type NestEstimatePanelProps = {
  pattern: ClientPattern;
  requiredPieceNames?: string[];
  /** Called after nest fields are saved (parent should refresh pattern). */
  onPatternUpdated?: (pattern: ClientPattern) => void;
};

export function NestEstimatePanel({
  pattern,
  requiredPieceNames = [],
  onPatternUpdated,
}: NestEstimatePanelProps) {
  const completeness = useMemo(
    () => evaluatePatternCuttingCompleteness(pattern, requiredPieceNames),
    [pattern, requiredPieceNames]
  );

  const tud = useMemo(
    () => collectNestTudMetadata(pattern, requiredPieceNames),
    [pattern, requiredPieceNames]
  );

  const sizes = tud?.sizes?.length ? tud.sizes : tud?.size_totals.map((r) => r.size) ?? [];
  const defaultSize =
    (pattern.base_size && sizes.includes(pattern.base_size) ? pattern.base_size : null) ??
    sizes[0] ??
    "";

  const [widthInput, setWidthInput] = useState(
    pattern.marker_fabric_width_cm != null ? String(pattern.marker_fabric_width_cm) : ""
  );
  const [doubleFold, setDoubleFold] = useState<"unset" | "yes" | "no">(
    pattern.marker_double_fold === true
      ? "yes"
      : pattern.marker_double_fold === false
        ? "no"
        : "unset"
  );
  const [size, setSize] = useState(defaultSize);
  const [garmentQty, setGarmentQty] = useState("1");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    setWidthInput(
      pattern.marker_fabric_width_cm != null ? String(pattern.marker_fabric_width_cm) : ""
    );
    setDoubleFold(
      pattern.marker_double_fold === true
        ? "yes"
        : pattern.marker_double_fold === false
          ? "no"
          : "unset"
    );
  }, [pattern.marker_fabric_width_cm, pattern.marker_double_fold, pattern.id]);

  useEffect(() => {
    if (defaultSize && (!size || !sizes.includes(size))) {
      setSize(defaultSize);
    }
  }, [defaultSize, size, sizes]);

  const estimate: NestEstimateResult | null = useMemo(() => {
    if (!tud) return null;
    const width = Number(widthInput);
    if (!(width > 0) || doubleFold === "unset") return null;
    const qty = Math.max(1, Math.floor(Number(garmentQty)) || 1);
    return estimateNestFromTud({
      tud,
      fabric_width_cm: width,
      double_fold: doubleFold === "yes",
      size: size || null,
      garment_qty: qty,
    });
  }, [tud, widthInput, doubleFold, size, garmentQty]);

  async function saveNestInputs() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const width = Number(widthInput);
      if (!(width > 0)) {
        throw new Error("Enter fabric width in cm.");
      }
      if (doubleFold === "unset") {
        throw new Error("Choose double fold yes or no.");
      }
      const res = await fetch(`/api/pattern/library/client-patterns/${pattern.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marker_fabric_width_cm: width,
          marker_double_fold: doubleFold === "yes",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save nest inputs.");
      setSaveOk(true);
      if (data.pattern) onPatternUpdated?.(data.pattern as ClientPattern);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div>
        <h3 className="flex items-center gap-2 font-semibold text-slate-900">
          <LayoutGrid className="h-4 w-4 text-slate-400" />
          Nest estimate (from TUD)
        </h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Set fabric width and double fold, then review the approximate meters and rough piece
          layout. Not a TUKAmark cutting marker.
        </p>
      </div>

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {completeness.items.map((item) => (
          <li
            key={item.id}
            className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
              item.done
                ? "bg-emerald-50 text-emerald-900"
                : item.optional
                  ? "bg-slate-50 text-slate-500"
                  : "bg-amber-50 text-amber-900"
            }`}
          >
            <span className="mt-0.5 font-mono text-xs">{item.done ? "[x]" : "[ ]"}</span>
            <span>
              <span className="font-medium">{item.label}</span>
              {item.optional ? (
                <span className="ml-1 text-xs font-normal opacity-70">(optional)</span>
              ) : null}
              {item.detail ? (
                <span className="mt-0.5 block text-xs opacity-80">{item.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
            <Ruler className="h-3.5 w-3.5" />
            Fabric width (cm)
          </span>
          <input
            type="number"
            min={1}
            step={0.1}
            value={widthInput}
            onChange={(e) => setWidthInput(e.target.value)}
            placeholder="e.g. 140"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Double fold</span>
          <select
            value={doubleFold}
            onChange={(e) => setDoubleFold(e.target.value as "unset" | "yes" | "no")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="unset">Select...</option>
            <option value="yes">Yes (double fold)</option>
            <option value="no">No (open width)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Size</span>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            disabled={sizes.length === 0}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          >
            {sizes.length === 0 ? <option value="">No TUD sizes</option> : null}
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Garment qty</span>
          <input
            type="number"
            min={1}
            step={1}
            value={garmentQty}
            onChange={(e) => setGarmentQty(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void saveNestInputs()}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save width / fold"}
        </button>
        {saveOk ? <span className="text-xs text-emerald-700">Saved.</span> : null}
        {saveError ? <span className="text-xs text-rose-600">{saveError}</span> : null}
      </div>

      {!tud ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          Upload a .TUD first to estimate nest meters and show the rough board.
        </p>
      ) : !estimate ? (
        <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50/60 px-3 py-4 text-sm text-amber-900">
          Enter fabric width and double fold to generate the estimate.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
              Approximate estimate
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-800">
              <span>
                <span className="text-slate-500">Suggested length </span>
                <strong>{estimate.estimated_length_m.toFixed(2)} m</strong>
              </span>
              <span>
                <span className="text-slate-500">Packed length </span>
                <strong>{estimate.packed_length_m.toFixed(2)} m</strong>
              </span>
              <span>
                <span className="text-slate-500">Efficiency </span>
                <strong>{estimate.efficiency_pct.toFixed(1)}%</strong>
              </span>
              <span>
                <span className="text-slate-500">Usable width </span>
                <strong>{estimate.usable_width_cm} cm</strong>
                {estimate.double_fold ? (
                  <span className="text-xs text-slate-500"> (half of {estimate.fabric_width_cm})</span>
                ) : null}
              </span>
              <span>
                <span className="text-slate-500">Shell area </span>
                <strong>{estimate.area_m2.toFixed(3)} m2</strong>
              </span>
            </div>
            {estimate.fabric_breakdown.length > 1 ? (
              <ul className="flex flex-wrap gap-3 text-xs text-slate-600">
                {estimate.fabric_breakdown.map((row) => (
                  <li key={row.fabric}>
                    {tudFabricLabel(row.fabric)}: {row.estimated_length_m.toFixed(2)} m (
                    {row.area_m2.toFixed(3)} m2)
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-xs text-indigo-900/80">{estimate.disclaimer}</p>
          </div>

          <RoughMarkerBoard estimate={estimate} />
        </>
      )}
    </section>
  );
}

function RoughMarkerBoard({ estimate }: { estimate: NestEstimateResult }) {
  const widthCm = Math.max(estimate.usable_width_cm, 1);
  const lengthCm = Math.max(
    estimate.packed_length_m * 100,
    ...estimate.placements.map((p) => p.x_cm + p.width_cm),
    1
  );
  const viewW = 720;
  const viewH = Math.max(120, Math.round((viewW * widthCm) / lengthCm));
  const scaleX = viewW / lengthCm;
  const scaleY = viewH / widthCm;

  const colors = [
    "#f9a8d4",
    "#99f6e4",
    "#fde68a",
    "#c4b5fd",
    "#fda4af",
    "#a5b4fc",
    "#86efac",
  ];
  const colorByName = new Map<string, string>();
  let colorIdx = 0;
  for (const p of estimate.placements) {
    if (!colorByName.has(p.name)) {
      colorByName.set(p.name, colors[colorIdx % colors.length]!);
      colorIdx += 1;
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Rough marker board (rectangles from area + perimeter)
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-2">
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          className="h-auto w-full min-w-[320px]"
          role="img"
          aria-label="Approximate fabric nest layout"
        >
          <rect x={0} y={0} width={viewW} height={viewH} fill="#cbd5e1" />
          {estimate.placements.map((p) => {
            const x = p.x_cm * scaleX;
            const y = p.y_cm * scaleY;
            const w = Math.max(p.width_cm * scaleX, 2);
            const h = Math.max(p.height_cm * scaleY, 2);
            const fill = colorByName.get(p.name) ?? "#f9a8d4";
            return (
              <g key={p.id}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={fill}
                  stroke="#334155"
                  strokeWidth={1}
                  opacity={p.secondary ? 0.55 : 0.92}
                />
                {w > 28 && h > 14 ? (
                  <text
                    x={x + w / 2}
                    y={y + h / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.min(11, h * 0.45)}
                    fill="#0f172a"
                  >
                    {p.name}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-slate-500">
        Length {lengthCm.toFixed(0)} cm x usable width {widthCm.toFixed(0)} cm ·{" "}
        {estimate.placements.length} piece rects · size {estimate.size} · qty{" "}
        {estimate.garment_qty}
      </p>
    </div>
  );
}
