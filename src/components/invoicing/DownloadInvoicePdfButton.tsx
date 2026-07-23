"use client";

import { useState } from "react";
import { ExternalLink, FileDown } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function DownloadInvoicePdfButton({
  invoiceId,
  invoiceNumber,
  variant = "secondary",
  size = "md",
  compact = false,
  label,
  kind,
  mode = "download",
}: {
  invoiceId: string;
  invoiceNumber: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  compact?: boolean;
  label?: string;
  kind?: "invoice" | "quote";
  /** download = save file; open = open PDF in a new tab for WhatsApp / share */
  mode?: "download" | "open";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedLabel =
    label ??
    (mode === "open"
      ? "Open PDF"
      : kind === "quote"
        ? "Download quote PDF"
        : "Download PDF");

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (kind) params.set("kind", kind);
      if (mode === "open") params.set("disposition", "inline");
      const query = params.toString();
      const res = await fetch(
        `/api/customer-invoices/${invoiceId}/pdf${query ? `?${query}` : ""}`
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to load PDF.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (mode === "open") {
        window.open(url, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        const prefix = kind === "quote" ? "QUOTE" : "INV";
        anchor.download = `${prefix}-${invoiceNumber}.pdf`;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PDF.");
    } finally {
      setBusy(false);
    }
  }

  const Icon = mode === "open" ? ExternalLink : FileDown;

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        variant={variant}
        size={size}
        className="gap-2"
        onClick={() => void handleClick()}
        disabled={busy}
        title={compact ? (busy ? "Loading…" : resolvedLabel) : undefined}
        aria-label={busy ? "Loading PDF" : resolvedLabel}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {compact ? null : busy ? "Loading…" : resolvedLabel}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
