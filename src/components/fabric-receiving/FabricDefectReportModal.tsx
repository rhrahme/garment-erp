"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FABRIC_DEFECT_TYPES } from "@/lib/types/fabric-receipts";
import type { FabricDefectFoundAt, FabricDefectType } from "@/lib/types/fabric-receipts";
import { cn } from "@/lib/utils";

export type ReportDefectContext = {
  receiptId: string;
  fabricCutCode: string;
  fabricNumber: string;
  soNumber: string;
  clientName: string;
  /** Default found_at based on UI context. */
  defaultFoundAt: FabricDefectFoundAt;
  /** When true, show Receiving | Cutting selector (QC/admin). */
  allowFoundAtChoice: boolean;
  title?: string;
};

type FabricDefectReportModalProps = {
  open: boolean;
  context: ReportDefectContext | null;
  onClose: () => void;
  onSubmitted: () => void;
};

export function FabricDefectReportModal({
  open,
  context,
  onClose,
  onSubmitted,
}: FabricDefectReportModalProps) {
  const titleId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [defectType, setDefectType] = useState<FabricDefectType | "">("");
  const [foundAt, setFoundAt] = useState<FabricDefectFoundAt>("receiving");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !context) return;
    setNote("");
    setDefectType("");
    setFoundAt(context.defaultFoundAt);
    setFiles([]);
    setPreviews([]);
    setError(null);
    setSubmitting(false);
  }, [open, context]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [files]);

  if (!open || !context) return null;

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
        continue;
      }
      next.push(file);
    }
    setFiles(next.slice(0, 6));
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const active = context;
    if (!active) return;
    setError(null);
    if (!note.trim()) {
      setError("Add a short note describing the defect.");
      return;
    }
    if (files.length === 0) {
      setError("Add at least one photo.");
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("receipt_id", active.receiptId);
      form.append("note", note.trim());
      form.append("found_at", foundAt);
      if (defectType) form.append("defect_type", defectType);
      for (const file of files) {
        form.append("photo", file);
      }

      const res = await fetch("/api/fabric-receiving/defects", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to report defect");
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to report defect");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {context.title ?? "Report defect"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {context.clientName} · {context.soNumber} ·{" "}
              <code className="font-semibold text-indigo-900">{context.fabricCutCode}</code>
            </p>
            <p className="text-sm text-slate-500">{context.fabricNumber}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-4 overflow-y-auto px-5 py-4">
            {context.allowFoundAtChoice && (
              <fieldset>
                <legend className="text-sm font-medium text-slate-800">Found at</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      { id: "receiving", label: "Receiving" },
                      { id: "cutting", label: "Cutting" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setFoundAt(option.id)}
                      className={cn(
                        "min-h-11 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                        foundAt === option.id
                          ? "bg-rose-600 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {foundAt === "cutting" && (
                  <p className="mt-2 text-xs text-amber-800">
                    Cutting = task team miss (receiving should have caught it).
                  </p>
                )}
              </fieldset>
            )}

            <fieldset>
              <legend className="text-sm font-medium text-slate-800">Type (optional)</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {FABRIC_DEFECT_TYPES.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setDefectType((current) => (current === type.id ? "" : type.id))}
                    className={cn(
                      "min-h-10 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                      defectType === type.id
                        ? "bg-slate-900 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="text-sm font-medium text-slate-800">
                Note <span className="text-rose-600">*</span>
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                required
                placeholder="Where is the defect? How big? Anything the cutter should know?"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base text-slate-900 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </label>

            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">
                  Photos <span className="text-rose-600">*</span>
                </span>
                <span className="text-xs text-slate-500">At least one · up to 6</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-rose-300 bg-rose-50 px-4 py-3 text-base font-semibold text-rose-900 hover:bg-rose-100"
              >
                <Camera className="h-5 w-5" />
                Take or choose photo
              </button>
              {previews.length > 0 && (
                <ul className="mt-3 grid grid-cols-3 gap-2">
                  {previews.map((url, index) => (
                    <li key={url} className="relative overflow-hidden rounded-lg border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-24 w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-1 text-white"
                        aria-label="Remove photo"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
            <Button type="button" variant="secondary" className="min-h-11 flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="min-h-11 flex-[1.4] bg-rose-600 hover:bg-rose-700 focus:ring-rose-500"
            >
              {submitting ? "Submitting…" : "Submit defect"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
