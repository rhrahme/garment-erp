"use client";

import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { qrImageUrl } from "@/lib/production/qr-labels";
import { formatMeasurement, unitLabel } from "@/lib/pattern-library/measurements";
import {
  clientPatternLabelCode,
  clientPatternQrUrl,
} from "@/lib/pattern-library/pattern-qr";
import type { PatternSheetData, PatternSheetSticker } from "@/lib/pattern-library/sheet-data";

const SHEET_PRINT_CSS = `
@page { size: A4 portrait; margin: 10mm; }
@media print {
  .no-print { display: none !important; }
  .pattern-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; }
  .pattern-sheet table { page-break-inside: auto; }
  .pattern-sheet tr { page-break-inside: avoid; }
  .mfg-qr-block { page-break-inside: avoid; }
  .cut-nest-block { page-break-inside: avoid; }
  .pattern-sheet-page { break-after: page; page-break-after: always; }
  .pattern-sheet-page:last-child { break-after: auto; page-break-after: auto; }
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

type SheetPageProps = {
  data: PatternSheetData;
  sticker: PatternSheetSticker | null;
  pageIndex: number;
  pageTotal: number;
};

const NEST_FILL = "#ffffff";
const NEST_STROKE = "#166534";

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
          ? metricBits.join(" · ")
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
          Length estimate — not available
        </p>
        <p className="mt-1 text-sm text-slate-700">
          {preview.missing_reason ?? "Upload TUD + set fabric width for length estimate."}
        </p>
        {preview.cutter_plan ? <CutterPartsFromTud plan={preview.cutter_plan} /> : null}
        {data.tud_thumbnail_data_url ? (
          <div className="mt-2 flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.tud_thumbnail_data_url}
              alt="TUD embedded preview"
              width={160}
              height={160}
              className="h-40 w-40 rounded border border-slate-300 bg-white object-contain p-1"
            />
            <p className="text-[10px] text-slate-500">
              TUD preview (100×100 embedded JFIF, enlarged) — visual reference only.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  const nest = preview.nest;
  const lengthCm = Math.max(
    (preview.board_length_m ?? nest.packed_length_m) * 100,
    nest.packed_length_m * 100,
    ...nest.placements.map((p) => p.x_cm + p.width_cm),
    1
  );
  const usableW = Math.max(nest.usable_width_cm, 1);
  const viewW = 640;
  const viewH = Math.max(96, Math.round((viewW * usableW) / lengthCm));
  const scaleX = viewW / lengthCm;
  const scaleY = viewH / usableW;
  const foldLabel = nest.double_fold
    ? preview.fold_assumed
      ? "Double fold assumed (shop default)"
      : "Double fold"
    : "Open width";
  const orderNote =
    preview.ordered_length_m != null
      ? ` · ordered ${preview.ordered_length_m.toFixed(2)} m${
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

      {data.tud_thumbnail_data_url ? (
        <div className="flex items-start gap-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.tud_thumbnail_data_url}
            alt="TUD embedded preview"
            width={160}
            height={160}
            className="h-40 w-40 rounded border border-slate-300 bg-white object-contain p-1"
          />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-800">
              TUD preview (embedded)
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              100×100 JFIF from the .tud — visual reference only (not cuttable outlines).
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-950">
          Length estimate only — not CAD outlines
        </p>
        <p className="mt-0.5 text-[11px] text-slate-700">
          {foldLabel} - usable {nest.usable_width_cm} cm of {nest.fabric_width_cm} cm · packed ~
          {nest.packed_length_m.toFixed(2)} m · size {nest.size}
          {orderNote}
          {preview.source === "saved" ? " · saved" : ""}
        </p>
        <p className="text-[11px] text-amber-900">
          Green boxes = area/perimeter rectangles from TUD header. Cut from real TUKA pieces, not
          this map.
        </p>
        <div className="mt-2 overflow-x-auto rounded border border-slate-300 bg-slate-100 p-1">
          <svg
            viewBox={`0 0 ${viewW} ${viewH}`}
            className="h-auto w-full min-w-[280px]"
            role="img"
            aria-label="Length estimate board from TUD areas"
          >
            <rect x={0} y={0} width={viewW} height={viewH} fill="#e2e8f0" />
            {nest.placements.map((p) => {
              const x = p.x_cm * scaleX;
              const y = p.y_cm * scaleY;
              const w = Math.max(p.width_cm * scaleX, 2);
              const h = Math.max(p.height_cm * scaleY, 2);
              return (
                <g key={p.id}>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={NEST_FILL}
                    stroke={NEST_STROKE}
                    strokeWidth={1.5}
                    opacity={0.95}
                  />
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
          Est. packed ~{nest.packed_length_m.toFixed(2)} m · {nest.placements.length} estimate
          rects · ~{nest.efficiency_pct.toFixed(0)}% (rough)
        </p>
      </div>
    </div>
  );
}

/** One A4 page - shared sheet info + cut nest + floor scan QR. */
function PatternSheetPage({ data, sticker, pageIndex, pageTotal }: SheetPageProps) {
  const {
    pattern,
    version,
    fabric,
    order,
    job,
    derived_from,
    house_brand,
    base_fill_warning,
    resolved_base_size,
  } = data;
  const unit = pattern.unit;
  const patternQrPayload = clientPatternQrUrl(pattern.id);
  const patternQrLabel = clientPatternLabelCode(pattern);
  const baseColLabel = resolved_base_size
    ? `Base (${resolved_base_size})`
    : pattern.base_size
      ? `Base (${pattern.base_size})`
      : "Base";

  return (
    <div className="pattern-sheet pattern-sheet-page rounded-xl border border-slate-200 p-6 shadow-sm print:shadow-none">
      {/* Top row: title + house brand letterhead + fixed pattern QR */}
      <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">PATTERN MEASUREMENT SHEET</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Cutting handoff - fold fabric, place parts, cut, then scan floor QR
          </p>
          <p className="mt-1 font-mono text-sm font-semibold">{pattern.pattern_ref}</p>
          {sticker?.production_code || job?.pattern_code ? (
            <p className="mt-0.5 font-mono text-xs text-slate-600">
              TUD name: {sticker?.production_code || job?.pattern_code}
            </p>
          ) : null}
          {pageTotal > 1 && sticker ? (
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
              Piece {pageIndex}/{pageTotal}: {piecePageLabel(sticker)}
            </p>
          ) : null}
        </div>
        <div className="flex items-start gap-3">
          <div className="min-w-[7.5rem] rounded-lg border-2 border-slate-900 px-4 py-2 text-center">
            <p className="text-2xl font-black tracking-widest">{house_brand.code ?? "-"}</p>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight text-slate-800">
              {house_brand.name ?? "House brand"}
            </p>
          </div>
          {/* Pattern library QR - archive deep link (not the floor scan code) */}
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrImageUrl(patternQrPayload, 200)}
              alt={patternQrLabel}
              className="h-20 w-20"
            />
            <p className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">
              Pattern library
            </p>
            <p className="max-w-24 break-all font-mono text-[8px] leading-tight">
              {patternQrLabel}
            </p>
          </div>
        </div>
      </div>

      {base_fill_warning ? (
        <div className="mt-3 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
          {base_fill_warning}
        </div>
      ) : null}

      {/* Header block */}
      <div className="mt-4">
        <table className="w-full text-sm">
          <tbody>
            {[
              ["Client", `${pattern.client_name} (${pattern.client_code})`],
              ["Garment", pattern.garment_type],
              ["Description", pattern.description ?? "-"],
              ["Origin", derived_from ?? "Custom"],
              [
                "Order",
                order
                  ? `${order.so_number} · ordered ${formatDate(order.order_date)}${order.delivery_date ? ` · delivery ${formatDate(order.delivery_date)}` : ""}`
                  : "-",
              ],
              [
                "Trial",
                `Trial ${version.version}${version.is_final ? " - FINAL" : ""} · ${formatDate(version.trial_date)}`,
              ],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-slate-200">
                <td className="w-28 py-1 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </td>
                <td className="py-1 font-medium">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fabric specification block */}
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
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {pattern.fabric ? `Fabric: ${pattern.fabric}` : "No linked order fabric line."}
          </p>
        )}
      </div>

      <CutNestPreviewBlock data={data} />

      {/* Cutting / floor scan QR - this piece only */}
      {sticker ? (
        <div className="mfg-qr-block mt-4 rounded-lg border-2 border-slate-900 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-900">
            Cutting / floor scan QR — {piecePageLabel(sticker)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            Handoff to cutting: cutter scans at cut; stitchers scan later (same code as stickers).
          </p>
          <div className="mt-3 flex justify-center">
            <div className="flex w-[7.5rem] flex-col items-center text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrImageUrl(sticker.qr_payload, 280)}
                alt={`Scan ${stickerScanLabel(sticker)}`}
                className="h-[6.5rem] w-[6.5rem] bg-white"
              />
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-900">
                {stickerScanLabel(sticker)}
              </p>
              <p className="mt-0.5 max-w-full break-all font-mono text-[10px] leading-tight text-slate-800">
                {sticker.production_code}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Measurement grid */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-slate-900 text-left text-xs font-bold uppercase tracking-wide">
            <th className="py-1.5 pr-2">Measurement point ({unitLabel(unit)})</th>
            <th className="px-2 py-1.5 text-center">{baseColLabel}</th>
            <th className="px-2 py-1.5 text-center">Target</th>
            <th className="px-2 py-1.5 text-center">Sewn</th>
            <th className="px-2 py-1.5 text-center">Adjust +/-</th>
            <th className="py-1.5 pl-2">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {version.measurements.map((row) => (
            <tr key={row.point_id} className="border-b border-slate-300">
              <td className="py-1.5 pr-2 font-medium">
                {row.name}
                {row.remark ? <span className="text-xs text-slate-500"> - {row.remark}</span> : null}
              </td>
              <td className="px-2 py-1.5 text-center tabular-nums text-slate-600">
                {formatMeasurement(row.base_value, unit)}
              </td>
              <td className="px-2 py-1.5 text-center font-semibold tabular-nums">
                {formatMeasurement(row.target_value, unit)}
              </td>
              <td className="px-2 py-1.5 text-center tabular-nums">
                {formatMeasurement(row.sewn_value, unit)}
              </td>
              <td className="px-2 py-1.5 text-center tabular-nums">
                {row.adjustment !== null
                  ? `${row.adjustment > 0 ? "+" : row.adjustment < 0 ? "-" : ""}${formatMeasurement(Math.abs(row.adjustment), unit)}`
                  : "-"}
              </td>
              <td className="py-1.5 pl-2 text-xs">{row.remarks ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer: special instructions + physical pattern */}
      <div className="mt-4 space-y-2 text-sm">
        <p>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Special instructions:
          </span>{" "}
          {version.special_instructions || pattern.special_instructions || "-"}
        </p>
        {pattern.physical_pattern_kept ? (
          <p>
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Physical pattern:
            </span>{" "}
            kept{pattern.physical_pattern_location ? ` - ${pattern.physical_pattern_location}` : ""}
          </p>
        ) : null}
        <p className="pt-2 text-[10px] text-slate-400">
          Printed {new Date().toLocaleDateString("en-GB")} · {pattern.pattern_ref} · Trial{" "}
          {version.version}
          {version.is_final ? " (Final)" : ""}
          {sticker ? ` · ${sticker.production_code}` : ""}
        </p>
      </div>
    </div>
  );
}

/** Printable A4 client-pattern measurement sheet - one page per manufacturing piece. */
export function PatternSheetPrintView({ data }: { data: PatternSheetData }) {
  const { pattern, version, stickers } = data;
  const pages: Array<PatternSheetSticker | null> =
    stickers.length > 0 ? stickers : [null];
  const pageTotal = pages.length;
  const mfgSummary =
    stickers.length > 0
      ? ` · ${stickers.length} page${stickers.length === 1 ? "" : "s"}: ${stickers.map((s) => piecePageLabel(s)).join(", ")}`
      : " · No manufacturing QRs (link a fabric line with stickers)";

  return (
    <div className="mx-auto min-h-screen max-w-[210mm] bg-white p-6 text-slate-900 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: SHEET_PRINT_CSS }} />

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <Link
            href={`/pattern/library/clients/${pattern.id}`}
            className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            Back to {pattern.pattern_ref}
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            A4 portrait · Trial {version.version}
            {version.is_final ? " (Final)" : ""}
            {` · Pattern QR ${clientPatternLabelCode(pattern)}`}
            {mfgSummary}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/pattern/library/client-patterns/${pattern.id}/pdf?version=${version.id}${data.job ? `&job=${data.job.id}` : ""}`}
            download
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
          >
            <Download className="h-4 w-4" />
            Download PDF
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

      <div className="space-y-8 print:space-y-0">
        {pages.map((sticker, index) => (
          <PatternSheetPage
            key={sticker ? `${sticker.role}-${sticker.qr_payload}` : "no-sticker"}
            data={data}
            sticker={sticker}
            pageIndex={index + 1}
            pageTotal={pageTotal}
          />
        ))}
      </div>
    </div>
  );
}
