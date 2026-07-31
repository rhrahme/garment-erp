"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, RotateCw, Ruler } from "lucide-react";
import { evaluatePatternCuttingCompleteness } from "@/lib/pattern-library/cutting-completeness";
import {
  buildAutoMarkerLayout,
  clampPlacement,
  layoutFromNestEstimate,
  recomputeMarkerMetrics,
  rotatePlacement90,
} from "@/lib/pattern-library/marker-layout";
import {
  collectNestTudMetadata,
  estimateNestFromTud,
} from "@/lib/pattern-library/nest-estimate";
import { tudFabricLabel } from "@/lib/pattern-library/tud-display";
import type { ClientPattern, MarkerLayout, MarkerLayoutPlacement } from "@/lib/types/pattern-library";

type NestEstimatePanelProps = {
  pattern: ClientPattern;
  requiredPieceNames?: string[];
  /** Prefill width from linked SO fabric when pattern has none saved. */
  defaultFabricWidthCm?: number | null;
  /** Called after nest fields are saved (parent should refresh pattern). */
  onPatternUpdated?: (pattern: ClientPattern) => void;
};

const PIECE_COLORS = [
  "#f9a8d4",
  "#99f6e4",
  "#fde68a",
  "#c4b5fd",
  "#fda4af",
  "#a5b4fc",
  "#86efac",
];

export function NestEstimatePanel({
  pattern,
  requiredPieceNames = [],
  defaultFabricWidthCm = null,
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

  const initialWidth =
    pattern.marker_fabric_width_cm != null
      ? String(pattern.marker_fabric_width_cm)
      : defaultFabricWidthCm != null && defaultFabricWidthCm > 0
        ? String(defaultFabricWidthCm)
        : "";

  const [widthInput, setWidthInput] = useState(initialWidth);
  const [doubleFold, setDoubleFold] = useState<"unset" | "yes" | "no">(
    pattern.marker_double_fold === true
      ? "yes"
      : pattern.marker_double_fold === false
        ? "no"
        : "yes"
  );
  const [size, setSize] = useState(defaultSize);
  const [garmentQty, setGarmentQty] = useState(
    pattern.marker_layout?.garment_qty != null
      ? String(pattern.marker_layout.garment_qty)
      : "1"
  );
  const [placements, setPlacements] = useState<MarkerLayoutPlacement[]>(
    pattern.marker_layout?.placements ?? []
  );
  const [areaM2, setAreaM2] = useState(pattern.marker_layout?.area_m2 ?? 0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setWidthInput(
      pattern.marker_fabric_width_cm != null
        ? String(pattern.marker_fabric_width_cm)
        : defaultFabricWidthCm != null && defaultFabricWidthCm > 0
          ? String(defaultFabricWidthCm)
          : ""
    );
    setDoubleFold(
      pattern.marker_double_fold === true
        ? "yes"
        : pattern.marker_double_fold === false
          ? "no"
          : "yes"
    );
    if (pattern.marker_layout?.placements?.length) {
      setPlacements(pattern.marker_layout.placements);
      setAreaM2(pattern.marker_layout.area_m2);
      setGarmentQty(String(pattern.marker_layout.garment_qty));
      if (pattern.marker_layout.size) setSize(pattern.marker_layout.size);
    }
  }, [
    pattern.marker_fabric_width_cm,
    pattern.marker_double_fold,
    pattern.marker_layout,
    pattern.id,
    defaultFabricWidthCm,
  ]);

  useEffect(() => {
    if (defaultSize && (!size || !sizes.includes(size))) {
      setSize(defaultSize);
    }
  }, [defaultSize, size, sizes]);

  const width = Number(widthInput);
  const usableWidthCm =
    width > 0 ? (doubleFold === "yes" ? width / 2 : width) : 0;

  const liveEstimate = useMemo(() => {
    if (!tud || !(width > 0) || doubleFold === "unset") return null;
    const qty = Math.max(1, Math.floor(Number(garmentQty)) || 1);
    return estimateNestFromTud({
      tud,
      fabric_width_cm: width,
      double_fold: doubleFold === "yes",
      size: size || null,
      garment_qty: qty,
    });
  }, [tud, width, doubleFold, size, garmentQty]);

  // Seed local board from auto pack when no placements yet but estimate is ready.
  useEffect(() => {
    if (placements.length > 0) return;
    if (!liveEstimate) return;
    setPlacements(liveEstimate.placements.map((p) => ({ ...p })));
    setAreaM2(liveEstimate.area_m2);
  }, [liveEstimate, placements.length]);

  const metrics = useMemo(
    () => recomputeMarkerMetrics(placements, usableWidthCm, areaM2),
    [placements, usableWidthCm, areaM2]
  );

  function autoNest() {
    if (!tud || !(width > 0)) return;
    const qty = Math.max(1, Math.floor(Number(garmentQty)) || 1);
    const nest = estimateNestFromTud({
      tud,
      fabric_width_cm: width,
      double_fold: doubleFold === "yes",
      size: size || null,
      garment_qty: qty,
    });
    if (!nest) return;
    setPlacements(nest.placements.map((p) => ({ ...p })));
    setAreaM2(nest.area_m2);
    setSelectedId(null);
    setSaveOk(false);
  }

  async function saveMarker(source: "auto" | "manual" = "manual") {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      if (!(width > 0)) throw new Error("Enter fabric width in cm.");
      if (doubleFold === "unset") throw new Error("Choose double fold yes or no.");
      if (!tud) throw new Error("Upload a .TUD first.");

      let layout: MarkerLayout | null = null;
      if (source === "auto" || placements.length === 0) {
        layout = buildAutoMarkerLayout(
          {
            ...pattern,
            marker_fabric_width_cm: width,
            marker_double_fold: doubleFold === "yes",
          },
          {
            fabric_width_cm: width,
            size: size || null,
            garment_qty: Math.max(1, Math.floor(Number(garmentQty)) || 1),
            requiredPieceNames,
          }
        );
        if (layout) {
          setPlacements(layout.placements);
          setAreaM2(layout.area_m2);
        }
      } else if (liveEstimate) {
        layout = layoutFromNestEstimate(
          {
            ...liveEstimate,
            placements: placements.map((p) => ({ ...p })),
            packed_length_m: metrics.packed_length_m,
            efficiency_pct: metrics.efficiency_pct,
            area_m2: areaM2 || liveEstimate.area_m2,
          },
          { source: "manual" }
        );
      }

      if (!layout) throw new Error("Could not build marker layout.");

      const res = await fetch(`/api/pattern/library/client-patterns/${pattern.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marker_fabric_width_cm: width,
          marker_double_fold: doubleFold === "yes",
          marker_layout: { ...layout, source },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save marker.");
      setSaveOk(true);
      if (data.pattern) onPatternUpdated?.(data.pattern as ClientPattern);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const pieceNames = useMemo(() => {
    const names: string[] = [];
    for (const p of placements) {
      if (!names.includes(p.name)) names.push(p.name);
    }
    return names;
  }, [placements]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <div>
        <h3 className="flex items-center gap-2 font-semibold text-slate-900">
          <LayoutGrid className="h-4 w-4 text-slate-400" />
          Marker board (from TUD)
        </h3>
        <p className="mt-0.5 text-sm text-slate-500">
          After TUD upload: set fabric width, auto-place pieces, drag/rotate like TUKAmrk, then
          save. Rectangles from TUD areas - not true CAD outlines.
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
          onClick={() => autoNest()}
          disabled={!tud || !(width > 0)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          Auto nest
        </button>
        <button
          type="button"
          onClick={() => {
            if (selectedId) {
              setPlacements((prev) =>
                prev.map((p) =>
                  p.id === selectedId ? rotatePlacement90(p, usableWidthCm) : p
                )
              );
            }
          }}
          disabled={!selectedId || !(usableWidthCm > 0)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Rotate 90
        </button>
        <button
          type="button"
          onClick={() => void saveMarker("manual")}
          disabled={saving || !tud || !(width > 0) || placements.length === 0}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save marker"}
        </button>
        {saveOk ? <span className="text-xs text-emerald-700">Saved.</span> : null}
        {saveError ? <span className="text-xs text-rose-600">{saveError}</span> : null}
      </div>

      {!tud ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          Upload a .TUD first to generate the marker board.
        </p>
      ) : !(width > 0) ? (
        <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50/60 px-3 py-4 text-sm text-amber-900">
          Enter fabric width to place pieces on the marker.
        </p>
      ) : (
        <>
          {pieceNames.length > 0 ? (
            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Piece bin
              </span>
              {pieceNames.map((name, i) => {
                const count = placements.filter((p) => p.name === name).length;
                return (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800"
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: PIECE_COLORS[i % PIECE_COLORS.length] }}
                    />
                    {name}
                    <span className="font-mono text-slate-500">x{count}</span>
                  </span>
                );
              })}
            </div>
          ) : null}

          <MarkerBoard
            placements={placements}
            usableWidthCm={usableWidthCm}
            fabricWidthCm={width}
            doubleFold={doubleFold === "yes"}
            packedLengthM={metrics.packed_length_m}
            efficiencyPct={metrics.efficiency_pct}
            areaM2={areaM2 || liveEstimate?.area_m2 || 0}
            size={size || liveEstimate?.size || "-"}
            garmentQty={Math.max(1, Math.floor(Number(garmentQty)) || 1)}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={(id, x_cm, y_cm) => {
              setPlacements((prev) =>
                prev.map((p) =>
                  p.id === id
                    ? clampPlacement({ ...p, x_cm, y_cm }, usableWidthCm)
                    : p
                )
              );
              setSaveOk(false);
            }}
          />

          {liveEstimate?.fabric_breakdown && liveEstimate.fabric_breakdown.length > 1 ? (
            <ul className="flex flex-wrap gap-3 text-xs text-slate-600">
              {liveEstimate.fabric_breakdown.map((row) => (
                <li key={row.fabric}>
                  {tudFabricLabel(row.fabric)}: {row.estimated_length_m.toFixed(2)} m (
                  {row.area_m2.toFixed(3)} m2)
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

function MarkerBoard({
  placements,
  usableWidthCm,
  fabricWidthCm,
  doubleFold,
  packedLengthM,
  efficiencyPct,
  areaM2,
  size,
  garmentQty,
  selectedId,
  onSelect,
  onMove,
}: {
  placements: MarkerLayoutPlacement[];
  usableWidthCm: number;
  fabricWidthCm: number;
  doubleFold: boolean;
  packedLengthM: number;
  efficiencyPct: number;
  areaM2: number;
  size: string;
  garmentQty: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x_cm: number, y_cm: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const widthCm = Math.max(usableWidthCm, 1);
  const lengthCm = Math.max(
    packedLengthM * 100,
    ...placements.map((p) => p.x_cm + p.width_cm),
    40
  );
  const viewW = 720;
  const viewH = Math.max(160, Math.round((viewW * widthCm) / Math.max(lengthCm, 1)));
  const scaleX = viewW / lengthCm;
  const scaleY = viewH / widthCm;

  const colorByName = useMemo(() => {
    const map = new Map<string, string>();
    let idx = 0;
    for (const p of placements) {
      if (!map.has(p.name)) {
        map.set(p.name, PIECE_COLORS[idx % PIECE_COLORS.length]!);
        idx += 1;
      }
    }
    return map;
  }, [placements]);

  function clientToCm(clientX: number, clientY: number): { x_cm: number; y_cm: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    const x_cm = ((clientX - rect.left) / rect.width) * lengthCm;
    const y_cm = ((clientY - rect.top) / rect.height) * widthCm;
    return { x_cm, y_cm };
  }

  return (
    <div className="space-y-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-sm">
      <div className="overflow-x-auto p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewW} ${viewH}`}
          className="h-auto w-full min-w-[320px] touch-none select-none"
          role="img"
          aria-label="Marker board layout"
          onPointerMove={(e) => {
            const drag = dragRef.current;
            if (!drag) return;
            const pt = clientToCm(e.clientX, e.clientY);
            if (!pt) return;
            onMove(drag.id, pt.x_cm - drag.offsetX, pt.y_cm - drag.offsetY);
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerLeave={() => {
            dragRef.current = null;
          }}
        >
          <rect x={0} y={0} width={viewW} height={viewH} fill="#3f3f46" />
          <rect
            x={0}
            y={0}
            width={viewW}
            height={viewH}
            fill="none"
            stroke="#71717a"
            strokeWidth={1}
          />
          {placements.map((p) => {
            const x = p.x_cm * scaleX;
            const y = p.y_cm * scaleY;
            const w = Math.max(p.width_cm * scaleX, 2);
            const h = Math.max(p.height_cm * scaleY, 2);
            const fill = colorByName.get(p.name) ?? "#f9a8d4";
            const selected = p.id === selectedId;
            return (
              <g
                key={p.id}
                style={{ cursor: "grab" }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  const pt = clientToCm(e.clientX, e.clientY);
                  if (!pt) return;
                  onSelect(p.id);
                  dragRef.current = {
                    id: p.id,
                    offsetX: pt.x_cm - p.x_cm,
                    offsetY: pt.y_cm - p.y_cm,
                  };
                }}
              >
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={fill}
                  stroke={selected ? "#f8fafc" : "#18181b"}
                  strokeWidth={selected ? 2.5 : 1}
                  opacity={p.secondary ? 0.55 : 0.95}
                />
                {w > 28 && h > 14 ? (
                  <text
                    x={x + w / 2}
                    y={y + h / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.min(11, h * 0.45)}
                    fill="#0f172a"
                    style={{ pointerEvents: "none" }}
                  >
                    {p.name}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-[11px] text-zinc-200">
        <span>Total: {placements.length}</span>
        <span>Placed: {placements.length}</span>
        <span>Efficiency: {efficiencyPct.toFixed(2)}%</span>
        <span>
          Width: {usableWidthCm.toFixed(0)}cm
          {doubleFold ? ` (fold of ${fabricWidthCm.toFixed(0)})` : ""}
        </span>
        <span>Length: {packedLengthM.toFixed(3)}m</span>
        <span>Area: {areaM2.toFixed(3)}m2</span>
        <span>Size: {size}</span>
        <span>Qty: {garmentQty}</span>
      </div>
      <p className="border-t border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-400">
        Drag pieces to move. Select + Rotate 90. Approximate from TUD areas - not a TUKAmark CAD
        marker.
      </p>
    </div>
  );
}
