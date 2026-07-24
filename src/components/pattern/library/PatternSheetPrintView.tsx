"use client";

import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { qrImageUrl } from "@/lib/production/qr-labels";
import { formatMeasurement, unitLabel } from "@/lib/pattern-library/measurements";
import type { PatternSheetData } from "@/lib/pattern-library/sheet-data";

const SHEET_PRINT_CSS = `
@page { size: A4 portrait; margin: 10mm; }
@media print {
  .no-print { display: none !important; }
  .pattern-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; }
  .pattern-sheet table { page-break-inside: auto; }
  .pattern-sheet tr { page-break-inside: avoid; }
}
`;

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-GB");
}

/** Printable A4 client-pattern measurement sheet — replaces the Excel printout. */
export function PatternSheetPrintView({ data }: { data: PatternSheetData }) {
  const { pattern, version, base, fabric, order, stickers, derived_from } = data;
  const unit = pattern.unit;
  const primarySticker = stickers[0] ?? null;

  return (
    <div className="mx-auto min-h-screen max-w-[210mm] bg-white p-6 text-slate-900 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: SHEET_PRINT_CSS }} />

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <Link
            href={`/pattern/library/clients/${pattern.id}`}
            className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
          >
            ← Back to {pattern.pattern_ref}
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            A4 portrait · Trial {version.version}
            {version.is_final ? " (Final)" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/pattern/library/client-patterns/${pattern.id}/pdf?version=${version.id}`}
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

      <div className="pattern-sheet rounded-xl border border-slate-200 p-6 shadow-sm">
        {/* Top row: title + house brand block */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">PATTERN MEASUREMENT SHEET</h1>
            <p className="mt-1 font-mono text-sm font-semibold">{pattern.pattern_ref}</p>
          </div>
          <div className="rounded-lg border-2 border-slate-900 px-4 py-2 text-center">
            <p className="text-2xl font-black tracking-widest">
              {pattern.house_brand_code ?? base?.house_brand_code ?? "—"}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">House brand</p>
          </div>
        </div>

        {/* Header block + QR */}
        <div className="mt-4 flex gap-4">
          <table className="flex-1 text-sm">
            <tbody>
              {[
                ["Client", `${pattern.client_name} (${pattern.client_code})`],
                ["Garment", pattern.garment_type],
                ["Description", pattern.description ?? "—"],
                ["Derived from", derived_from ?? "—"],
                [
                  "Order",
                  order
                    ? `${order.so_number} · ordered ${formatDate(order.order_date)}${order.delivery_date ? ` · delivery ${formatDate(order.delivery_date)}` : ""}`
                    : "—",
                ],
                [
                  "Trial",
                  `Trial ${version.version}${version.is_final ? " — FINAL" : ""} · ${formatDate(version.trial_date)}`,
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
          {primarySticker ? (
            <div className="shrink-0 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrImageUrl(primarySticker.qr_payload, 200)}
                alt={primarySticker.code}
                className="h-28 w-28"
              />
              <p className="mt-1 max-w-32 break-all font-mono text-[9px] leading-tight">
                {primarySticker.code}
              </p>
            </div>
          ) : null}
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
                <span className="font-semibold">{fabric.color ?? "—"}</span>
              </p>
              <p>
                <span className="text-slate-500">Composition:</span>{" "}
                <span className="font-semibold">{fabric.composition ?? "—"}</span>
              </p>
              <p>
                <span className="text-slate-500">Weight:</span>{" "}
                <span className="font-semibold">{fabric.gsm ? `${fabric.gsm} gsm` : "—"}</span>
              </p>
              <p>
                <span className="text-slate-500">Width:</span>{" "}
                <span className="font-semibold">
                  {fabric.width_cm
                    ? `${fabric.width_cm} cm`
                    : fabric.width_inches
                      ? `${fabric.width_inches}"`
                      : "—"}
                </span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {pattern.fabric ? `Fabric: ${pattern.fabric}` : "No linked order fabric line."}
            </p>
          )}
        </div>

        {/* Measurement grid */}
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-900 text-left text-xs font-bold uppercase tracking-wide">
              <th className="py-1.5 pr-2">Measurement point ({unitLabel(unit)})</th>
              <th className="px-2 py-1.5 text-center">Base</th>
              <th className="px-2 py-1.5 text-center">Target</th>
              <th className="px-2 py-1.5 text-center">Sewn</th>
              <th className="px-2 py-1.5 text-center">Adjust ±</th>
              <th className="py-1.5 pl-2">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {version.measurements.map((row) => (
              <tr key={row.point_id} className="border-b border-slate-300">
                <td className="py-1.5 pr-2 font-medium">
                  {row.name}
                  {row.remark ? <span className="text-xs text-slate-500"> — {row.remark}</span> : null}
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
                    ? `${row.adjustment > 0 ? "+" : row.adjustment < 0 ? "−" : ""}${formatMeasurement(Math.abs(row.adjustment), unit)}`
                    : "—"}
                </td>
                <td className="py-1.5 pl-2 text-xs">{row.remarks ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer: special instructions + physical pattern + stickers */}
        <div className="mt-4 space-y-2 text-sm">
          <p>
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Special instructions:
            </span>{" "}
            {version.special_instructions || pattern.special_instructions || "—"}
          </p>
          {pattern.physical_pattern_kept ? (
            <p>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Physical pattern:
              </span>{" "}
              kept{pattern.physical_pattern_location ? ` — ${pattern.physical_pattern_location}` : ""}
            </p>
          ) : null}
          {stickers.length > 1 ? (
            <p className="font-mono text-xs text-slate-600">
              Pieces: {stickers.map((sticker) => sticker.code).join("  ·  ")}
            </p>
          ) : null}
          <p className="pt-2 text-[10px] text-slate-400">
            Printed {new Date().toLocaleDateString("en-GB")} · {pattern.pattern_ref} · Trial{" "}
            {version.version}
            {version.is_final ? " (Final)" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
