"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { filenameFromResponse } from "@/lib/pdf/download-filename";

export function DownloadCostHintPdfButton({
  href,
  label = "Print cost hint PDF",
  variant = "secondary",
  size = "md",
  compact = false,
}: {
  href: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to load cost hint PDF.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameFromResponse(res, "cost-hints.pdf");
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cost hint PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "inline-flex items-center" : "inline-flex flex-col items-start gap-1"}>
      <Button
        variant={variant}
        size={size}
        className="gap-2"
        onClick={() => void handleClick()}
        disabled={busy}
        title={error ?? "Download internal cost hint PDF"}
        aria-label={label}
      >
        <FileDown className="h-4 w-4 shrink-0" />
        <span className={compact ? "hidden sm:inline" : undefined}>{busy ? "Loading..." : label}</span>
      </Button>
      {!compact && error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
