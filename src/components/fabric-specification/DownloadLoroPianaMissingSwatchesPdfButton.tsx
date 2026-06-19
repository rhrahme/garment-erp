"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import {
  LORO_PIANA_MISSING_SWATCHES_PDF_FILENAME,
  LORO_PIANA_MISSING_SWATCHES_PDF_URL,
} from "@/lib/fabric-sourcing/generate-loro-piana-missing-swatches-pdf";

export function DownloadLoroPianaMissingSwatchesPdfButton() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(LORO_PIANA_MISSING_SWATCHES_PDF_URL);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to download PDF.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = LORO_PIANA_MISSING_SWATCHES_PDF_FILENAME;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download PDF.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={downloading}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <FileDown className="h-4 w-4" />
        {downloading ? "Downloading…" : "Download missing swatches PDF"}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
