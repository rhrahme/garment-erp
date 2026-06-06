"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function DownloadSalesOrderPdfButton({
  orderId,
  soNumber,
  variant = "secondary",
}: {
  orderId: string;
  soNumber: string;
  variant?: "primary" | "secondary" | "ghost";
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
      <Button variant={variant} onClick={() => void handleDownload()} disabled={downloading}>
        <FileDown className="h-4 w-4" />
        {downloading ? "Downloading…" : "Download PDF"}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
