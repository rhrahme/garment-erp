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
}: {
  href: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
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
      const fallback = href.includes("clients=") ? "cost-hints.zip" : "cost-hints.pdf";
      anchor.download = filenameFromResponse(res, fallback);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cost hint PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button variant={variant} size={size} className="gap-2" onClick={() => void handleClick()} disabled={busy}>
        <FileDown className="h-4 w-4 shrink-0" />
        {busy ? "Loading..." : label}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
