"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileUp, Paperclip } from "lucide-react";
import { formatAreaM2, formatPieceAreaM2 } from "@/lib/pattern-library/tud-display";
import type { PatternLibraryAttachment, TudMetadata } from "@/lib/types/pattern-library";

const KIND_LABELS: Record<string, string> = {
  tud: "TUKA",
  xlsx: "Excel",
  dxf: "DXF",
  pdf: "PDF",
  image: "Image",
  other: "File",
};

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Attachment list + uploader for base patterns, client patterns, and trial versions. */
export function LibraryFileList({
  files,
  uploadUrl,
  downloadUrlBase,
  onUploaded,
  title = "Files",
}: {
  files: PatternLibraryAttachment[];
  /** POST target (multipart, field `file`). */
  uploadUrl: string;
  /** GET base — `?file=<stored_filename>` is appended. */
  downloadUrlBase: string;
  onUploaded: () => void;
  title?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Upload failed.");
      }
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const joiner = downloadUrlBase.includes("?") ? "&" : "?";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 ring-1 ring-slate-200 hover:bg-slate-50">
          <FileUp className="h-3.5 w-3.5" />
          {busy ? "Uploading…" : "Upload"}
          <input
            ref={inputRef}
            type="file"
            accept=".tud,.xlsx,.xls,.dxf,.pdf,.png,.jpg,.jpeg,.webp,.heic"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
        </label>
      </div>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      {files.length === 0 ? (
        <p className="text-xs text-slate-400">No files yet — .TUD, Excel, DXF, PDF, images.</p>
      ) : (
        <ul className="space-y-1">
          {files.map((file) => (
            <li key={file.id}>
              <a
                href={`${downloadUrlBase}${joiner}file=${encodeURIComponent(file.stored_filename)}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{file.filename}</span>
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                  {KIND_LABELS[file.kind] ?? file.kind}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{formatSize(file.size_bytes)}</span>
              </a>
              {file.tud ? (
                <TudMetadataPanel
                  metadata={file.tud}
                  thumbnailUrl={
                    file.thumbnail_stored_filename
                      ? `${downloadUrlBase}${joiner}file=${encodeURIComponent(file.thumbnail_stored_filename)}`
                      : null
                  }
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Parsed TUKA CAD info shown under a .tud attachment row. */
function TudMetadataPanel({
  metadata,
  thumbnailUrl,
}: {
  metadata: TudMetadata;
  thumbnailUrl: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalArea =
    metadata.total_area_m2 ??
    (metadata.size_totals.length > 0
      ? metadata.size_totals.reduce((sum, total) => sum + total.area_m2, 0)
      : null);

  return (
    <div className="mb-1 ml-7 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
      <div className="flex items-start gap-3">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt={metadata.style_caption ?? "TUKA preview"}
            width={100}
            height={100}
            className="h-20 w-20 shrink-0 rounded-md border border-slate-200 bg-white object-contain p-1"
          />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          {metadata.style_caption ? (
            <p className="truncate text-sm font-medium text-slate-800" title={metadata.style_caption}>
              {metadata.style_caption}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {metadata.sizes.map((size) => (
              <span
                key={size}
                className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700"
              >
                {size}
              </span>
            ))}
            <span className="text-slate-500">
              {metadata.pieces.length} piece{metadata.pieces.length === 1 ? "" : "s"}
              {metadata.total_cut_pieces !== null ? ` · ${metadata.total_cut_pieces} to cut` : ""}
            </span>
          </div>
          {totalArea !== null ? (
            <p className="text-sm font-semibold text-emerald-700">
              {formatAreaM2(totalArea)}{" "}
              <span className="font-normal text-slate-500">total fabric</span>
            </p>
          ) : null}
        </div>
      </div>

      {metadata.pieces.length > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {expanded ? "Hide piece list" : "Show piece list"}
        </button>
      ) : null}

      {expanded ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-400">
                <th className="py-1 pr-2 font-medium">Piece</th>
                <th className="px-2 py-1 text-center font-medium">Cut</th>
                <th className="px-2 py-1 font-medium">Fabric</th>
                {metadata.sizes.map((size) => (
                  <th key={size} className="px-2 py-1 text-right font-medium">
                    Area {size}
                  </th>
                ))}
                <th className="py-1 pl-2 text-right font-medium">Perim.</th>
              </tr>
            </thead>
            <tbody>
              {metadata.pieces.map((piece) => {
                const firstEntry = Object.values(piece.per_size)[0] ?? null;
                return (
                  <tr key={piece.name} className="border-b border-slate-100">
                    <td className="whitespace-nowrap py-1 pr-2 font-medium text-slate-700">
                      {piece.name}
                    </td>
                    <td className="px-2 py-1 text-center tabular-nums text-slate-600">
                      {piece.cut_quantity ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-slate-500">{piece.fabric ?? "—"}</td>
                    {metadata.sizes.map((size) => (
                      <td key={size} className="px-2 py-1 text-right tabular-nums text-slate-600">
                        {formatPieceAreaM2(piece.per_size[size]?.area_m2 ?? null)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums text-slate-500">
                      {firstEntry ? `${firstEntry.perimeter_cm.toFixed(0)} cm` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {metadata.fabric_totals.length > 0 ? (
              <tfoot>
                {metadata.fabric_totals.map((total) => (
                  <tr key={`${total.size}-${total.fabric}`} className="text-slate-500">
                    <td className="py-1 pr-2" colSpan={2}>
                      Total {total.fabric}
                      {metadata.sizes.length > 1 ? ` (${total.size})` : ""}
                    </td>
                    <td className="px-2 py-1" />
                    <td
                      className="px-2 py-1 text-right font-medium tabular-nums text-slate-700"
                      colSpan={metadata.sizes.length}
                    >
                      {formatAreaM2(total.area_m2)}
                    </td>
                    <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums">
                      {total.perimeter_cm.toFixed(0)} cm
                    </td>
                  </tr>
                ))}
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : null}
    </div>
  );
}
