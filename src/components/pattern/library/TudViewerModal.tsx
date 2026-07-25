"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { formatTudSizeDerivedLine } from "@/lib/pattern-library/derived-from";
import {
  formatAreaM2,
  formatPieceAreaM2,
  tudFabricLabel,
} from "@/lib/pattern-library/tud-display";
import type { PatternLibraryAttachment, TudMetadata } from "@/lib/types/pattern-library";

/**
 * Full-screen-ish viewer for a .TUD attachment: large preview (upscaled from
 * the embedded 100×100 JPEG) plus a browser for the parsed piece list and
 * fabric totals. Read-only — the .tud geometry itself is not decoded.
 *
 * Pass `basePatternName` from the parent client-pattern context so the viewer
 * can show which base the size was derived from without a second fetch.
 * Omit the prop entirely on base-pattern pages (derivation does not apply).
 */
export function TudViewerModal({
  attachment,
  thumbnailUrl,
  downloadUrl,
  onClose,
  basePatternName,
}: {
  attachment: PatternLibraryAttachment;
  thumbnailUrl: string | null;
  downloadUrl: string;
  onClose: () => void;
  /** Linked base display name; `null` = show "No base linked"; omit on base patterns. */
  basePatternName?: string | null;
}) {
  const metadata = attachment.tud ?? null;
  const [mounted, setMounted] = useState(false);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tud-viewer-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[94vh] sm:rounded-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                TUKA
              </span>
              <p id="tud-viewer-title" className="truncate text-base font-semibold text-slate-900">
                {metadata?.style_caption ?? attachment.filename}
              </p>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">{attachment.filename}</p>
            {basePatternName !== undefined ? (
              <p className="mt-1.5 text-sm font-medium text-slate-700">
                {formatTudSizeDerivedLine(metadata?.sizes ?? [], basePatternName)}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={downloadUrl}
              download={attachment.filename}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-indigo-700 ring-1 ring-slate-200 hover:bg-indigo-50"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download .tud</span>
              <span className="sm:hidden">.tud</span>
            </a>
            <button
              type="button"
              onClick={handleClose}
              className="min-h-11 min-w-11 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Close viewer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body — stacked on phone/tablet portrait, side-by-side on large screens */}
        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:overflow-hidden">
          {/* Large preview — soft upscale of the embedded 100×100 JPEG */}
          <div className="flex flex-col items-center justify-center gap-3 bg-slate-50 p-5 sm:p-8 lg:overflow-y-auto">
            {thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailUrl}
                alt={metadata?.style_caption ?? "TUKA pattern preview"}
                className="aspect-square w-full max-w-[min(100%,560px)] rounded-2xl border border-slate-200 bg-white object-contain p-5 shadow-sm sm:p-8"
                style={{ imageRendering: "auto" }}
              />
            ) : (
              <p className="text-sm text-slate-400">No preview embedded in this file.</p>
            )}
            <p className="text-center text-[11px] text-slate-400">
              Preview extracted from the TUKA file (100×100 source, enlarged)
            </p>
          </div>

          {/* Piece browser */}
          <div className="min-w-0 space-y-4 p-4 sm:p-5 lg:overflow-y-auto">
            {metadata ? (
              <TudPieceBrowser metadata={metadata} basePatternName={basePatternName} />
            ) : (
              <p className="text-sm text-slate-500">
                No parsed TUKA data for this file — only the preview is available.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TudPieceBrowser({
  metadata,
  basePatternName,
}: {
  metadata: TudMetadata;
  basePatternName?: string | null;
}) {
  const grandTotal =
    metadata.total_area_m2 ??
    (metadata.size_totals.length > 0
      ? metadata.size_totals.reduce((sum, total) => sum + total.area_m2, 0)
      : null);

  return (
    <>
      {basePatternName !== undefined ? (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-500">
            Size · derived from
          </p>
          <p className="mt-0.5 text-base font-semibold leading-snug text-indigo-950 sm:text-lg">
            {formatTudSizeDerivedLine(metadata.sizes, basePatternName)}
          </p>
        </div>
      ) : null}

      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {metadata.sizes.map((size) => (
          <span key={size} className="rounded bg-indigo-50 px-2 py-1 font-semibold text-indigo-700">
            {size}
          </span>
        ))}
        <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">
          {metadata.pieces.length} piece{metadata.pieces.length === 1 ? "" : "s"}
        </span>
        {metadata.total_cut_pieces !== null ? (
          <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">
            {metadata.total_cut_pieces} to cut
          </span>
        ) : null}
        {grandTotal !== null ? (
          <span className="rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
            {formatAreaM2(grandTotal)} total fabric
          </span>
        ) : null}
      </div>

      {/* Piece table */}
      {metadata.pieces.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 font-medium">Piece</th>
                <th className="px-2 py-2.5 text-center font-medium">Cut</th>
                <th className="px-2 py-2.5 font-medium">Fabric</th>
                {metadata.sizes.map((size) => (
                  <th key={size} className="px-2 py-2.5 text-right font-medium">
                    Area {size}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-medium">Perim.</th>
              </tr>
            </thead>
            <tbody>
              {metadata.pieces.map((piece) => {
                const firstEntry = Object.values(piece.per_size)[0] ?? null;
                return (
                  <tr key={piece.name} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-800">
                      {piece.name}
                    </td>
                    <td className="px-2 py-2.5 text-center tabular-nums text-slate-600">
                      {piece.cut_quantity ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-slate-500">
                      {tudFabricLabel(piece.fabric)}
                    </td>
                    {metadata.sizes.map((size) => (
                      <td key={size} className="px-2 py-2.5 text-right tabular-nums text-slate-600">
                        {formatPieceAreaM2(piece.per_size[size]?.area_m2 ?? null)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-500">
                      {firstEntry ? `${firstEntry.perimeter_cm.toFixed(0)} cm` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-400">No pieces parsed from this file.</p>
      )}

      {/* Totals */}
      {metadata.fabric_totals.length > 0 || metadata.size_totals.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Fabric totals (all pieces × cut quantities)
          </p>
          <div className="mt-1.5 space-y-1 text-sm">
            {metadata.fabric_totals.map((total) => (
              <div
                key={`${total.size}-${total.fabric}`}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-slate-600">
                  {tudFabricLabel(total.fabric)}
                  {metadata.sizes.length > 1 ? ` (${total.size})` : ""}
                </span>
                <span className="tabular-nums text-slate-700">
                  {formatAreaM2(total.area_m2)}
                  <span className="ml-2 text-xs text-slate-400">
                    {total.perimeter_cm.toFixed(0)} cm perim.
                  </span>
                </span>
              </div>
            ))}
            {metadata.size_totals.map((total) => (
              <div
                key={total.size}
                className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-1 font-semibold"
              >
                <span className="text-slate-800">
                  Total{metadata.sizes.length > 1 ? ` ${total.size}` : ""}
                </span>
                <span className="tabular-nums text-emerald-700">
                  {formatAreaM2(total.area_m2)}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {total.perimeter_cm.toFixed(0)} cm perim.
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Source path from the CAD workstation */}
      {metadata.source_path ? (
        <p className="break-all font-mono text-[11px] text-slate-400" title="Original CAD file path">
          {metadata.source_path}
        </p>
      ) : null}
    </>
  );
}
