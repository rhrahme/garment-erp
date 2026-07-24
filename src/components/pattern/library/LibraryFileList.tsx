"use client";

import { useRef, useState } from "react";
import { FileUp, Paperclip } from "lucide-react";
import type { PatternLibraryAttachment } from "@/lib/types/pattern-library";

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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
