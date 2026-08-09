"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { outlinePointsForPlacement } from "@/lib/pattern-library/dxf-parser";
import { useMeasurementUnitPreference } from "@/hooks/useMeasurementUnitPreference";
import {
  resolvePatternDisplayUnit,
  withMeasurementUnitParam,
} from "@/lib/pattern-library/measurement-unit-preference";
import {
  formatMeasurementForDisplay,
  unitLabel,
} from "@/lib/pattern-library/measurements";
import type { MeasurementUnit } from "@/lib/types/pattern-library";
import {
  clientPatternLabelCode,
  clientPatternQrUrl,
} from "@/lib/pattern-library/pattern-qr";
import type { PatternSheetKind } from "@/lib/pattern-library/pattern-sheet-kind";
import {
  expandCutterPrintPages,
  expandProductionArticlePages,
} from "@/lib/pattern-library/expand-cutter-print-pages";
import { filterMeasurementsForStitcherPiece } from "@/lib/pattern-library/measurement-template-mode";
import type {
  PatternSheetArticlePage,
  PatternSheetData,
  PatternSheetSticker,
} from "@/lib/pattern-library/sheet-data";
import { qrImageUrl } from "@/lib/production/qr-labels";

/** Shared with order-board batch print (page breaks between selected jobs). */
export const PATTERN_SHEET_PRINT_CSS = `
@page { size: A4 portrait; margin: 8mm; }
@media print {
  .no-print { display: none !important; }
  .pattern-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; }
  .pattern-sheet-production {
    font-size: 10px !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }
  .pattern-sheet-production table { page-break-inside: avoid; }
  .pattern-sheet-production tr { page-break-inside: avoid; }
  .pattern-sheet table { page-break-inside: auto; }
  .pattern-sheet tr { page-break-inside: avoid; }
  .mfg-qr-block { page-break-inside: avoid; }
  /* Nest may shrink; do not force a blank second page when QR needs room. */
  .cut-nest-block { page-break-inside: auto; }
  .pattern-sheet-page { break-after: page; page-break-after: always; }
  .pattern-sheet-page:last-child { break-after: auto; page-break-after: auto; }
  /* Production + sewing: one A4 per stitcher page (article x piece), each with its QR. */
  .pattern-sheet-production.pattern-sheet-page {
    break-after: page !important;
    page-break-after: always !important;
  }
  .pattern-sheet-production.pattern-sheet-page:last-child {
    break-after: auto !important;
    page-break-after: auto !important;
  }
  /* Cutter: one fabric article per A4 - keep nest short so QRs stay on the same page. */
  .pattern-sheet-cutter .cut-nest-svg {
    max-height: 28mm !important;
  }
  /* Batch: keep page breaks between jobs; only the last page of the pack stops. */
  .pattern-batch-root .pattern-batch-job-block .pattern-sheet-page {
    break-after: page !important;
    page-break-after: always !important;
  }
  .pattern-batch-root .pattern-batch-job-block:last-child .pattern-sheet-page:last-child {
    break-after: auto !important;
    page-break-after: auto !important;
  }
}
`;

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-GB");
}

function stickerScanLabel(sticker: PatternSheetSticker): string {
  return sticker.role === "prep" ? "Fabric cut (prep)" : sticker.piece_name;
}

function piecePageLabel(sticker: PatternSheetSticker): string {
  if (sticker.piece_index != null && sticker.piece_total != null) {
    return `${sticker.piece_name} (${sticker.piece_index}/${sticker.piece_total})`;
  }
  return sticker.piece_name;
}

function sheetQuery(
  kind: PatternSheetKind,
  data: PatternSheetData,
  lineIds?: string[] | null
): string {
  const params = new URLSearchParams({ sheet: kind, version: data.version.id });
  // Keep fabric-job scope when switching cutter <-> production / PDF.
  if (data.scoped_job_id) params.set("job", data.scoped_job_id);
  const scopedLine =
    data.job?.sales_order_line_id ||
    (data.article_pages.length === 1 ? data.article_pages[0]?.line_id : null);
  if (data.scoped_job_id && scopedLine) params.set("line", scopedLine);
  const lines = lineIds ?? data.article_pages.map((page) => page.line_id);
  // Keep fabric subset when switching sheet kinds / PDF (unscoped masters).
  if (!data.scoped_job_id && lines.length > 0) params.set("lines", lines.join(","));
  return params.toString();
}

type SheetPageProps = {
  data: PatternSheetData;
  stickers: PatternSheetSticker[];
  pageIndex: number;
  pageTotal: number;
};

const NEST_FILL = "#a7f3d0";
const NEST_FILL_RECT = "#ffffff";
const NEST_STROKE = "#166534";
const NEST_BOARD = "#3f3f46";

function CutterPartsFromTud({ plan }: { plan: NonNullable<PatternSheetData["cut_nest"]["cutter_plan"]> }) {
  const rows = [...plan.shell_pieces, ...plan.other_pieces];
  return (
    <div className="mt-2">
      <p className="text-[11px] font-semibold text-slate-800">
        Parts from TUD (size {plan.size}) - {plan.total_cut_pieces} to cut
      </p>
      <p className="text-[10px] text-slate-600">{plan.instruction}</p>
      <table className="mt-1 w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-slate-300 text-left text-slate-500">
            <th className="py-0.5 pr-2 font-medium">Piece</th>
            <th className="py-0.5 pr-2 font-medium">Qty</th>
            <th className="py-0.5 pr-2 font-medium">Fabric</th>
            <th className="py-0.5 pr-2 font-medium">Approx</th>
            <th className="py-0.5 font-medium">Place</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-slate-200">
              <td className="py-0.5 pr-2 font-medium text-slate-900">
                {row.name}
                {row.code ? (
                  <span className="ml-1 font-mono text-slate-500">{row.code}</span>
                ) : null}
              </td>
              <td className="py-0.5 pr-2 tabular-nums">{row.cut_quantity}</td>
              <td className="py-0.5 pr-2">{row.fabric_label}</td>
              <td className="py-0.5 pr-2 tabular-nums">
                {row.approx_width_cm.toFixed(0)}x{row.approx_height_cm.toFixed(0)} cm
              </td>
              <td className="py-0.5 text-slate-600">{row.place_hint}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-0.5 text-[9px] text-slate-500">{plan.disclaimer}</p>
    </div>
  );
}

function TumMarkerPreviewBlock({ data }: { data: PatternSheetData }) {
  const marker = data.marker;
  if (!marker) return null;
  const tum = marker.tum;
  const lengthM = tum?.length_cm != null ? tum.length_cm / 100 : null;
  const metricBits = [
    tum?.width_cm != null ? `width ${tum.width_cm.toFixed(1)} cm` : null,
    lengthM != null ? `length ${lengthM.toFixed(2)} m` : null,
    tum?.efficiency_pct != null ? `efficiency ${tum.efficiency_pct.toFixed(1)}%` : null,
    tum?.size ? `size ${tum.size}` : null,
    tum?.garment_qty != null ? `qty ${tum.garment_qty}` : null,
  ].filter(Boolean);

  return (
    <div className="cut-nest-block mt-4 rounded-lg border border-slate-800 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-900">
        Fabric cut layout (from TUKAmrk)
      </p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-800">
        {tum?.style_caption ?? marker.attachment.filename}
      </p>
      <p className="text-[11px] text-slate-600">
        {metricBits.length > 0
          ? metricBits.join(" - ")
          : "Shop marker attached (metrics unavailable)."}
      </p>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        {marker.thumbnail_data_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={marker.thumbnail_data_url}
            alt="TUKAmrk marker preview"
            width={112}
            height={112}
            className="h-28 w-28 rounded border border-slate-300 bg-white object-contain p-1"
          />
        ) : null}
        {tum && tum.pieces.length > 0 ? (
          <table className="min-w-0 flex-1 border-collapse text-[10px]">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-500">
                <th className="py-0.5 pr-2 font-medium">Piece</th>
                <th className="py-0.5 pr-2 font-medium">Qty</th>
                <th className="py-0.5 pr-2 font-medium">Fabric</th>
                <th className="py-0.5 font-medium">Area m2</th>
              </tr>
            </thead>
            <tbody>
              {tum.pieces.map((piece) => (
                <tr key={piece.name} className="border-b border-slate-200">
                  <td className="py-0.5 pr-2 font-medium text-slate-900">
                    {piece.name}
                    {piece.code ? (
                      <span className="ml-1 font-mono text-slate-500">{piece.code}</span>
                    ) : null}
                  </td>
                  <td className="py-0.5 pr-2 tabular-nums">{piece.cut_quantity ?? "-"}</td>
                  <td className="py-0.5 pr-2">{piece.fabric ?? "-"}</td>
                  <td className="py-0.5 tabular-nums">
                    {piece.area_m2 != null ? piece.area_m2.toFixed(4) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      <p className="mt-1 text-[9px] text-slate-500">
        Nesting done in TUKAmrk outside ERP. Preview + -D metrics from attached .tum (not CAD
        outline decode).
      </p>
    </div>
  );
}

function CutNestPreviewBlock({ data }: { data: PatternSheetData }) {
  // Optional .tum archive path only when actually attached.
  if (data.marker) {
    return <TumMarkerPreviewBlock data={data} />;
  }

  const preview = data.cut_nest;
  if (!preview.nest) {
    return (
      <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
          Length estimate - not available
        </p>
        <p className="mt-1 text-sm text-slate-700">
          {preview.missing_reason ?? "Upload TUD + set fabric width for length estimate."}
        </p>
        {preview.cutter_plan ? <CutterPartsFromTud plan={preview.cutter_plan} /> : null}
      </div>
    );
  }

  const nest = preview.nest;
  const hasDxf = Boolean(nest.has_dxf_outlines);
  const lengthCm = Math.max(
    (preview.board_length_m ?? nest.packed_length_m) * 100,
    nest.packed_length_m * 100,
    ...nest.placements.map((p) => p.x_cm + p.width_cm),
    1
  );
  const usableW = Math.max(nest.usable_width_cm, 1);
  const viewW = 640;
  // Uniform scale (same X/Y) - matches NestEstimatePanel / PDF letterbox transform.
  const viewH = Math.max(96, Math.round((viewW * usableW) / lengthCm));
  const scale = viewW / lengthCm;
  const foldLabel = nest.double_fold
    ? preview.fold_assumed
      ? "Double fold assumed (shop default)"
      : "Double fold"
    : "Open width";
  const orderNote =
    preview.ordered_length_m != null
      ? ` - ordered ${preview.ordered_length_m.toFixed(2)} m${
          preview.fits_on_order === true
            ? " (fits)"
            : preview.fits_on_order === false
              ? " (OVER)"
              : ""
        }`
      : "";

  return (
    <div className="cut-nest-block mt-4 space-y-2">
      {preview.cutter_plan ? (
        <div className="rounded-lg border border-slate-300 bg-white p-3">
          <CutterPartsFromTud plan={preview.cutter_plan} />
        </div>
      ) : null}

      <div
        className={`rounded-lg border p-3 ${
          hasDxf
            ? "border-emerald-300 bg-emerald-50"
            : "border-amber-300 bg-amber-50"
        }`}
      >
        <p
          className={`text-xs font-bold uppercase tracking-wide ${
            hasDxf ? "text-emerald-950" : "text-amber-950"
          }`}
        >
          {hasDxf
            ? "Fabric cut layout - DXF piece outlines"
            : "Length estimate only - not CAD outlines"}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-700">
          {foldLabel} - usable {nest.usable_width_cm} cm of {nest.fabric_width_cm} cm - packed ~
          {nest.packed_length_m.toFixed(2)} m - size {nest.size}
          {orderNote}
          {preview.source === "saved" ? " - saved" : ""}
        </p>
        <p className={`text-[11px] ${hasDxf ? "text-emerald-900" : "text-amber-900"}`}>
          {hasDxf
            ? "Green shapes = DXF polylines. Nest uses bounding-box shelves - verify in TUKAmark before cutting."
            : "Green boxes = area/perimeter rectangles from TUD header. Cut from real TUKA pieces, not this map."}
        </p>
        <div className="mt-2 overflow-x-auto rounded border border-slate-300 bg-slate-100 p-1">
          <svg
            viewBox={`0 0 ${viewW} ${viewH}`}
            className="cut-nest-svg h-auto w-full min-w-[280px]"
            role="img"
            aria-label={
              hasDxf
                ? "Fabric cut layout from DXF outlines"
                : "Length estimate board from TUD areas"
            }
          >
            <rect x={0} y={0} width={viewW} height={viewH} fill={NEST_BOARD} />
            {nest.placements.map((p) => {
              const x = p.x_cm * scale;
              const y = p.y_cm * scale;
              const w = Math.max(p.width_cm * scale, 2);
              const h = Math.max(p.height_cm * scale, 2);
              const localOutline = outlinePointsForPlacement(
                p.outline_cm,
                p,
                p.outline_width_cm ?? undefined
              );
              const polygonPoints =
                localOutline && localOutline.length >= 3
                  ? localOutline
                      .map(
                        (pt) =>
                          `${(p.x_cm + pt.x) * scale},${(p.y_cm + pt.y) * scale}`
                      )
                      .join(" ")
                  : null;
              return (
                <g key={p.id}>
                  {polygonPoints ? (
                    <polygon
                      points={polygonPoints}
                      fill={NEST_FILL}
                      stroke={NEST_STROKE}
                      strokeWidth={1.5}
                      opacity={0.95}
                    />
                  ) : (
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill={NEST_FILL_RECT}
                      stroke={NEST_STROKE}
                      strokeWidth={1.5}
                      opacity={0.95}
                    />
                  )}
                  {w > 28 && h > 12 ? (
                    <text
                      x={x + w / 2}
                      y={y + h / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={Math.min(11, h * 0.4)}
                      fill="#14532d"
                    >
                      {p.name}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          {hasDxf
            ? `Packed ~${nest.packed_length_m.toFixed(2)} m - ${nest.placements.length} DXF pieces - ~${nest.efficiency_pct.toFixed(0)}% (bbox nest)`
            : `Est. packed ~${nest.packed_length_m.toFixed(2)} m - ${nest.placements.length} estimate rects - ~${nest.efficiency_pct.toFixed(0)}% (rough)`}
        </p>
      </div>
    </div>
  );
}

function FabricSpecBlock({ data }: { data: PatternSheetData }) {
  const { fabric, pattern } = data;
  return (
    <div className="mt-4 rounded-lg border border-slate-300 p-3">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
        Fabric specification
      </p>
      {fabric ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm sm:grid-cols-3">
          <p>
            <span className="text-slate-500">Fabric:</span>{" "}
            <span className="font-semibold">{fabric.fabric_number}</span>
          </p>
          <p>
            <span className="text-slate-500">Supplier:</span>{" "}
            <span className="font-semibold">{fabric.supplier_name}</span>
          </p>
          <p>
            <span className="text-slate-500">Color:</span>{" "}
            <span className="font-semibold">{fabric.color ?? "-"}</span>
          </p>
          <p>
            <span className="text-slate-500">Composition:</span>{" "}
            <span className="font-semibold">{fabric.composition ?? "-"}</span>
          </p>
          <p>
            <span className="text-slate-500">Weight:</span>{" "}
            <span className="font-semibold">{fabric.gsm ? `${fabric.gsm} gsm` : "-"}</span>
          </p>
          <p>
            <span className="text-slate-500">Width:</span>{" "}
            <span className="font-semibold">
              {fabric.width_cm
                ? `${fabric.width_cm} cm`
                : fabric.width_inches
                  ? `${fabric.width_inches}"`
                  : "-"}
            </span>
          </p>
          {fabric.ordered_meters != null ? (
            <p>
              <span className="text-slate-500">Ordered:</span>{" "}
              <span className="font-semibold">{fabric.ordered_meters.toFixed(2)} m</span>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          {pattern.fabric ? `Fabric: ${pattern.fabric}` : "No linked order fabric line."}
        </p>
      )}
    </div>
  );
}

/** Cutter A4 page - cut layout + all floor QRs on one page. */
function CutterSheetPage({ data, stickers, pageIndex, pageTotal }: SheetPageProps) {
  const { pattern, version, order, job, house_brand } = data;
  const qrSizeClass = stickers.length > 2 ? "h-14 w-14" : "h-16 w-16";

  return (
    <div className="pattern-sheet pattern-sheet-page pattern-sheet-cutter rounded-xl border border-slate-200 p-4 shadow-sm print:shadow-none">
      <div className="flex items-start justify-between gap-3 border-b-2 border-slate-900 pb-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight">CUTTER SHEET</h1>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Cutting handoff - fold fabric, place parts, cut, then scan floor QR
          </p>
          <p className="mt-1 font-mono text-sm font-semibold">{pattern.pattern_ref}</p>
          {job?.pattern_code ? (
            <p className="mt-0.5 font-mono text-[11px] text-slate-600">
              TUD name: {job.pattern_code}
            </p>
          ) : null}
          {pageTotal > 1 ? (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
              Fabric {pageIndex}/{pageTotal}
            </p>
          ) : null}
        </div>
        <div className="min-w-[6.5rem] rounded-lg border-2 border-slate-900 px-3 py-1.5 text-center">
          <p className="text-xl font-black tracking-widest">{house_brand.code ?? "-"}</p>
          <p className="mt-0.5 text-[10px] font-semibold leading-tight text-slate-800">
            {house_brand.name ?? "House brand"}
          </p>
        </div>
      </div>

      <div className="mt-2">
        <table className="w-full text-[12px]">
          <tbody>
            {[
              ["Client", `${pattern.client_name} (${pattern.client_code})`],
              ["Garment", pattern.garment_type],
              [
                "Order",
                order
                  ? `${order.so_number} - ordered ${formatDate(order.order_date)}${order.delivery_date ? ` - delivery ${formatDate(order.delivery_date)}` : ""}`
                  : "-",
              ],
              [
                "Trial",
                `Trial ${version.version}${version.is_final ? " - FINAL" : ""} - ${formatDate(version.trial_date)}`,
              ],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-slate-200">
                <td className="w-24 py-0.5 pr-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </td>
                <td className="py-0.5 font-medium">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FabricSpecBlock data={data} />
      <CutNestPreviewBlock data={data} />

      {stickers.length > 0 ? (
        <div className="mfg-qr-block mt-2 rounded-lg border-2 border-slate-900 p-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-900">
            Floor scan QR{stickers.length > 1 ? "s" : ""}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-600">
            Cutter scans at cut. Same codes are used later on the floor.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            {stickers.map((sticker) => (
              <div
                key={`${sticker.role}-${sticker.qr_payload}`}
                className="flex w-[5.5rem] flex-col items-center text-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrImageUrl(sticker.qr_payload, 200)}
                  alt={`Scan ${stickerScanLabel(sticker)}`}
                  className={`${qrSizeClass} bg-white`}
                />
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-900">
                  {stickerScanLabel(sticker)}
                </p>
                <p className="max-w-full break-all font-mono text-[8px] leading-tight text-slate-800">
                  {sticker.production_code}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-2 pt-1 text-[9px] text-slate-400">
        Printed {new Date().toLocaleDateString("en-GB")} - {pattern.pattern_ref} - Trial{" "}
        {version.version}
        {version.is_final ? " (Final)" : ""}
      </p>
    </div>
  );
}

/** Compact fabric line for production (single-page stitcher sheet). */
function FabricSpecCompact({
  fabric,
  patternFabric,
}: {
  fabric: PatternSheetData["fabric"];
  patternFabric: string | null | undefined;
}) {
  if (!fabric) {
    return (
      <p className="mt-2 text-[11px] text-slate-600">
        {patternFabric ? `Fabric: ${patternFabric}` : "No linked order fabric line."}
      </p>
    );
  }
  const bits = [
    `Fabric: ${fabric.fabric_number}`,
    `Supplier: ${fabric.supplier_name}`,
    `Color: ${fabric.color ?? "-"}`,
    fabric.gsm ? `${fabric.gsm} gsm` : null,
    fabric.width_cm
      ? `${fabric.width_cm} cm`
      : fabric.width_inches
        ? `${fabric.width_inches}"`
        : null,
    fabric.ordered_meters != null ? `Ordered: ${fabric.ordered_meters.toFixed(2)} m` : null,
  ].filter(Boolean);
  return (
    <div className="mt-2 border border-slate-300 px-2 py-1.5">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Fabric</p>
      <p className="text-[11px] leading-snug text-slate-900">{bits.join("  |  ")}</p>
      {fabric.composition ? (
        <p className="text-[10px] text-slate-600">Composition: {fabric.composition}</p>
      ) : null}
    </div>
  );
}

/** Production / stitcher A4 - measurements + sewing context (exactly one page). */
function ProductionSheetPage({
  data,
  article = null,
  sewing = false,
  pageIndex,
  pageTotal,
  displayUnit,
}: {
  data: PatternSheetData;
  article?: PatternSheetArticlePage | null;
  sewing?: boolean;
  pageIndex?: number;
  pageTotal?: number;
  displayUnit: MeasurementUnit;
}) {
  const {
    pattern,
    version,
    job,
    derived_from,
    house_brand,
    base_fill_warning,
    resolved_base_size,
  } = data;
  const order = article?.order ?? data.order;
  const fabric = article?.fabric ?? data.fabric;
  const stickers = article?.stickers ?? data.stickers;
  const measurements = filterMeasurementsForStitcherPiece(
    version.measurements,
    article?.measurement_point_ids,
    article?.measurement_point_names
  );
  const storedUnit = pattern.unit;
  const patternQrPayload = clientPatternQrUrl(pattern.id);
  const patternQrLabel = clientPatternLabelCode(pattern);
  const baseColLabel = resolved_base_size
    ? `Base (${resolved_base_size})`
    : pattern.base_size
      ? `Base (${pattern.base_size})`
      : "Base";
  const useTwoCol = measurements.length > 28;
  const title = sewing ? "SEWING / STITCHER SHEET" : "PRODUCTION / STITCHER SHEET";
  const pieceLabel = article?.piece_name?.trim() || null;

  return (
    <div
      className={`pattern-sheet pattern-sheet-page pattern-sheet-production rounded-xl border border-slate-200 p-4 shadow-sm print:p-0 print:shadow-none${
        sewing ? " pattern-sheet-sewing" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-900 pb-2">
        <div>
          <h1 className="text-base font-bold tracking-tight">{title}</h1>
          <p className="mt-0.5 font-mono text-xs font-semibold">{pattern.pattern_ref}</p>
          {article ? (
            <p className="mt-0.5 font-mono text-sm font-black tracking-wide text-slate-900">
              Article {article.article_code}
              {pieceLabel ? ` - ${pieceLabel}` : ""}
              {pageIndex != null && pageTotal != null && pageTotal > 1
                ? ` - page ${pageIndex}/${pageTotal}`
                : ""}
            </p>
          ) : null}
          {job?.pattern_code ? (
            <p className="font-mono text-[10px] text-slate-600">TUD: {job.pattern_code}</p>
          ) : null}
        </div>
        <div className="flex items-start gap-2">
          <div className="min-w-[5.5rem] rounded border-2 border-slate-900 px-2 py-1 text-center">
            <p className="text-lg font-black tracking-widest">{house_brand.code ?? "-"}</p>
            <p className="text-[9px] font-semibold leading-tight text-slate-800">
              {house_brand.name ?? "House brand"}
            </p>
          </div>
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrImageUrl(patternQrPayload, 160)}
              alt={patternQrLabel}
              className="h-14 w-14"
            />
            <p className="mt-0.5 text-[7px] font-bold uppercase tracking-wide text-slate-500">
              Pattern library
            </p>
            <p className="max-w-20 break-all font-mono text-[7px] leading-tight">
              {patternQrLabel}
            </p>
          </div>
        </div>
      </div>

      {base_fill_warning ? (
        <div className="mt-1.5 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-950">
          {base_fill_warning}
        </div>
      ) : null}

      <table className="mt-2 w-full text-[11px]">
        <tbody>
          {[
            ["Client", `${pattern.client_name} (${pattern.client_code})`],
            [
              "Garment",
              pieceLabel
                ? `${pieceLabel} (${pattern.garment_type})`
                : article?.garment_type || pattern.garment_type,
            ],
            ...(article
              ? ([["Article", article.article_code]] as Array<[string, string]>)
              : []),
            ...(pieceLabel ? ([["Piece", pieceLabel]] as Array<[string, string]>) : []),
            ["Origin", derived_from ?? "Custom"],
            [
              "Order",
              order
                ? `${order.so_number} - ordered ${formatDate(order.order_date)}${order.delivery_date ? ` - delivery ${formatDate(order.delivery_date)}` : ""}`
                : "-",
            ],
            [
              "Trial",
              `Trial ${version.version}${version.is_final ? " - FINAL" : ""} - ${formatDate(version.trial_date)}`,
            ],
          ].map(([label, value]) => (
            <tr key={label} className="border-b border-slate-200">
              <td className="w-16 py-0.5 pr-2 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </td>
              <td className="py-0.5 font-medium">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <FabricSpecCompact fabric={fabric} patternFabric={pattern.fabric} />

      <div className={useTwoCol ? "mt-2 grid grid-cols-2 gap-2" : "mt-2"}>
        {(useTwoCol
          ? [
              measurements.slice(0, Math.ceil(measurements.length / 2)),
              measurements.slice(Math.ceil(measurements.length / 2)),
            ]
          : [measurements]
        ).map((chunk, chunkIndex) => (
          <table key={chunkIndex} className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="border-b border-slate-900 text-left text-[9px] font-bold uppercase tracking-wide">
                <th className="py-0.5 pr-1">Meas. ({unitLabel(displayUnit)})</th>
                <th className="px-1 py-0.5 text-center">{baseColLabel}</th>
                <th className="px-1 py-0.5 text-center">Tgt</th>
                <th className="px-1 py-0.5 text-center">Sewn</th>
                <th className="px-1 py-0.5 text-center">+/-</th>
                <th className="py-0.5 pl-1">Rmk</th>
              </tr>
            </thead>
            <tbody>
              {chunk.map((row) => (
                <tr key={row.point_id} className="border-b border-slate-300">
                  <td className="py-0.5 pr-1 font-medium leading-tight">
                    {row.name}
                    {row.remark ? (
                      <span className="text-[9px] text-slate-500"> - {row.remark}</span>
                    ) : null}
                  </td>
                  <td className="px-1 py-0.5 text-center tabular-nums text-slate-600">
                    {formatMeasurementForDisplay(row.base_value, storedUnit, displayUnit)}
                  </td>
                  <td className="px-1 py-0.5 text-center font-semibold tabular-nums">
                    {formatMeasurementForDisplay(row.target_value, storedUnit, displayUnit)}
                  </td>
                  <td className="px-1 py-0.5 text-center tabular-nums">
                    {formatMeasurementForDisplay(row.sewn_value, storedUnit, displayUnit)}
                  </td>
                  <td className="px-1 py-0.5 text-center tabular-nums">
                    {row.adjustment !== null
                      ? `${row.adjustment > 0 ? "+" : row.adjustment < 0 ? "-" : ""}${formatMeasurementForDisplay(Math.abs(row.adjustment), storedUnit, displayUnit)}`
                      : "-"}
                  </td>
                  <td className="max-w-[4rem] truncate py-0.5 pl-1 text-[9px]">
                    {row.remarks ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      <div className="mt-2 space-y-0.5 text-[11px] leading-snug">
        <p>
          <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
            Stitcher comments:
          </span>{" "}
          {version.special_instructions || pattern.special_instructions || "-"}
        </p>
        {version.notes?.trim() ? (
          <p>
            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Sheet notes:
            </span>{" "}
            {version.notes}
          </p>
        ) : null}
        {pattern.notes?.trim() ? (
          <p>
            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Pattern notes:
            </span>{" "}
            {pattern.notes}
          </p>
        ) : null}
        {pattern.physical_pattern_kept ? (
          <p>
            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
              Physical:
            </span>{" "}
            kept{pattern.physical_pattern_location ? ` - ${pattern.physical_pattern_location}` : ""}
          </p>
        ) : null}
      </div>

      {stickers.length > 0 ? (
        <div className="mfg-qr-block mt-2 border border-slate-900 p-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-900">
            Piece / floor scan QR
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-3">
            {stickers.map((sticker) => (
              <div
                key={`${sticker.role}-${sticker.qr_payload}`}
                className="flex w-[4.5rem] flex-col items-center text-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrImageUrl(sticker.qr_payload, 160)}
                  alt={`Scan ${stickerScanLabel(sticker)}`}
                  className="h-14 w-14 bg-white"
                />
                <p className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-900">
                  {stickerScanLabel(sticker)}
                </p>
                <p className="max-w-full break-all font-mono text-[8px] leading-tight text-slate-800">
                  {sticker.production_code}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">No manufacturing QRs linked.</p>
      )}

      <p className="mt-1.5 text-[9px] text-slate-400">
        Printed {new Date().toLocaleDateString("en-GB")} - {pattern.pattern_ref} - Trial{" "}
        {version.version}
        {version.is_final ? " (Final)" : ""}
      </p>
    </div>
  );
}

/** Printable A4 client-pattern sheet - cutter, production, or sewing pack. */
export function PatternSheetPrintView({
  data,
  kind = "cutter",
  /** When true, only sheet pages (for order-board batch print chrome). */
  embedded = false,
}: {
  data: PatternSheetData;
  kind?: PatternSheetKind;
  embedded?: boolean;
}) {
  const searchParams = useSearchParams();
  const { unit: preferenceUnit } = useMeasurementUnitPreference();
  const displayUnit = resolvePatternDisplayUnit(searchParams.get("unit"), preferenceUnit);
  const { pattern, version, stickers, article_pages } = data;
  const isProduction = kind === "production";
  const isSewing = kind === "sewing";
  const sewingPages = isSewing ? expandProductionArticlePages(data) : [];
  const productionPages = isProduction ? expandProductionArticlePages(data) : [];
  const cutterPages = !isProduction && !isSewing ? expandCutterPrintPages(data) : [];
  const pageTotal = isSewing
    ? sewingPages.length
    : isProduction
      ? productionPages.length || 1
      : cutterPages.length || 1;
  const articleSummary = (pages: PatternSheetArticlePage[]) =>
    pages.length > 0
      ? ` - ${pages.length} stitcher page${pages.length === 1 ? "" : "s"}: ${pages
          .map(
            (page) =>
              `${page.article_code}${page.piece_name ? ` ${page.piece_name}` : ""} (${page.fabric.fabric_number})`
          )
          .join(", ")}`
      : " - No linked articles with SO fabric lines";
  const mfgSummary = isSewing
    ? articleSummary(sewingPages)
    : isProduction
      ? articleSummary(productionPages)
      : cutterPages.length > 1 && cutterPages.some((page) => page.article_code)
        ? ` - ${cutterPages.length} page${cutterPages.length === 1 ? "" : "s"} (per article fabric): ${[
            ...new Set(cutterPages.map((page) => page.article_code).filter(Boolean)),
          ].join(", ")}`
        : stickers.length > 0
          ? ` - ${stickers.length} piece QR${stickers.length === 1 ? "" : "s"}: ${stickers.map((s) => piecePageLabel(s)).join(", ")}`
          : " - No manufacturing QRs (link a fabric line with stickers)";
  const qs = withMeasurementUnitParam(
    `/pattern/client-patterns/${pattern.id}/print?${sheetQuery(kind, data)}`,
    displayUnit
  ).split("?")[1]!;
  const switchKind: PatternSheetKind = isSewing
    ? "production"
    : isProduction
      ? "cutter"
      : "sewing";
  const otherQs = withMeasurementUnitParam(
    `/pattern/client-patterns/${pattern.id}/print?${sheetQuery(switchKind, data)}`,
    displayUnit
  ).split("?")[1]!;
  const kindLabel = isSewing
    ? "Sewing A4s (one page per stitcher piece)"
    : isProduction
      ? "Production / stitcher (one page per stitcher piece)"
      : "Cutter";
  const backHref = data.scoped_job_id
    ? `/pattern/library/clients/${pattern.id}?job=${encodeURIComponent(data.scoped_job_id)}`
    : `/pattern/library/clients/${pattern.id}`;
  const headerFabric =
    (isProduction || isSewing) &&
    (isProduction ? productionPages : sewingPages).length === 1
      ? (isProduction ? productionPages : sewingPages)[0]?.fabric.fabric_number
      : !isProduction && !isSewing
        ? data.fabric?.fabric_number
        : null;

  const pages = (
    <div className="space-y-8 print:space-y-0">
      {isSewing ? (
        sewingPages.length > 0 ? (
          sewingPages.map((article, index) => (
            <ProductionSheetPage
              key={`${article.line_id}-${article.piece_name ?? index}`}
              data={data}
              article={article}
              sewing
              pageIndex={index + 1}
              pageTotal={pageTotal}
              displayUnit={displayUnit}
            />
          ))
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            No linked fabric articles to print. Group SO fabric lines into this pattern first.
          </p>
        )
      ) : isProduction ? (
        productionPages.length > 0 ? (
          productionPages.map((article, index) => (
            <ProductionSheetPage
              key={`${article.line_id}-${article.piece_name ?? index}`}
              data={data}
              article={article}
              pageIndex={index + 1}
              pageTotal={pageTotal}
              displayUnit={displayUnit}
            />
          ))
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            No linked fabric articles to print. Group SO fabric lines into this pattern first.
          </p>
        )
      ) : (
        cutterPages.map((page) => (
          <CutterSheetPage
            key={`${page.article_code ?? "primary"}-${page.pageIndex}`}
            data={page.data}
            stickers={page.stickers}
            pageIndex={page.pageIndex}
            pageTotal={page.pageTotal}
          />
        ))
      )}
    </div>
  );

  if (embedded) {
    return <div className="pattern-batch-job-block bg-white text-slate-900">{pages}</div>;
  }

  return (
    <div className="mx-auto min-h-screen max-w-[210mm] bg-white p-6 text-slate-900 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: PATTERN_SHEET_PRINT_CSS }} />

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <Link
            href={backHref}
            className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            Back to {pattern.pattern_ref}
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            A4 portrait - {kindLabel} - Trial {version.version}
            {version.is_final ? " (Final)" : ""}
            {headerFabric ? ` - Fabric ${headerFabric}` : ""}
            {isProduction || isSewing ? ` - Pattern QR ${clientPatternLabelCode(pattern)}` : ""}
            {mfgSummary}
            {` - ${unitLabel(displayUnit)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/pattern/client-patterns/${pattern.id}/print?${otherQs}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
          >
            Switch to {switchKind === "cutter" ? "cutter" : "production"}
          </Link>
          <a
            href={`/api/pattern/library/client-patterns/${pattern.id}/pdf?${qs}`}
            download
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
          >
            <Download className="h-4 w-4" />
            Download {isSewing ? "sewing" : isProduction ? "production" : "cutter"} PDF
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      {pages}
    </div>
  );
}
