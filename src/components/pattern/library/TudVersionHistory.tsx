"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { listClientPatternTudVersions } from "@/lib/pattern-library/tud-versions";
import type { ClientPattern } from "@/lib/types/pattern-library";
import { cn } from "@/lib/utils";
import type { LibraryUploadResponse } from "@/components/pattern/library/LibraryFileList";

function formatWhen(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function TudVersionHistory({
  pattern,
  onUploaded,
  onActivate,
}: {
  pattern: ClientPattern;
  onUploaded: (response?: LibraryUploadResponse) => void;
  onActivate?: (fileId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const versions = listClientPatternTudVersions(pattern);
  const uploadUrl = `/api/pattern/library/client-patterns/${pattern.id}/files`;
  const downloadBase = `/api/pattern/library/client-patterns/${pattern.id}/files`;

  async function handleFile(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(uploadUrl, { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Upload failed.");
      onUploaded(body as LibraryUploadResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">TUKA .TUD versions</p>
          <p className="text-xs text-slate-500">
            Re-upload after each trial update. Latest upload is active unless you pick another.
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".tud,.TUD"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading..." : versions.length ? "Re-upload .TUD" : "Upload .TUD"}
          </button>
        </div>
      </div>

      {versions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
          No .TUD yet. After designing in Tuka, upload the consolidated file here.
        </p>
      ) : (
        <ol className="space-y-2">
          {[...versions].reverse().map((entry) => (
            <li
              key={entry.attachment.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5",
                entry.is_active
                  ? "border-indigo-200 bg-indigo-50/60"
                  : "border-slate-100 bg-slate-50/50"
              )}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    v{entry.version}
                  </span>
                  {entry.is_active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </span>
                  ) : null}
                  {entry.trial_version != null ? (
                    <span className="text-[11px] text-slate-500">
                      Trial {entry.trial_version}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-500">Pattern file</span>
                  )}
                </div>
                <p className="truncate text-xs text-slate-600" title={entry.attachment.filename}>
                  {entry.attachment.filename}
                </p>
                <p className="text-[11px] text-slate-400">
                  {formatWhen(entry.attachment.uploaded_at)}
                  {entry.attachment.uploaded_by
                    ? `  ${entry.attachment.uploaded_by}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`${downloadBase}?file=${encodeURIComponent(entry.attachment.stored_filename)}`}
                  className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  Download
                </a>
                {!entry.is_active && onActivate ? (
                  <button
                    type="button"
                    onClick={() => onActivate(entry.attachment.id)}
                    className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
                  >
                    Make active
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
