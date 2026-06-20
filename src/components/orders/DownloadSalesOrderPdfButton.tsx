"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function DownloadSalesOrderPdfButton({
  orderId,
  soNumber,
  variant = "secondary",
  size = "md",
  compact = false,
}: {
  orderId: string;
  soNumber: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  compact?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${orderId}/pdf`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to download PDF.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${soNumber}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download PDF.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        variant={variant}
        size={size}
        onClick={() => void handleDownload()}
        disabled={downloading}
        title={compact ? (downloading ? "Downloading…" : "Download PDF") : undefined}
      >
        <FileDown className="h-4 w-4" />
        {compact ? null : downloading ? "Downloading…" : "Download PDF"}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
