"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { badgePdfHref } from "@/lib/hr/badge-print";
import type { IdBadgeGroup } from "@/lib/hr/payroll-utils";

export function DownloadEmployeeBadgePdfButton({
  group,
  employeeIds,
  label,
  disabled = false,
  className,
}: {
  group: IdBadgeGroup;
  /** When set, only these employees are included (same as print ?ids=). */
  employeeIds?: readonly string[];
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setBusy(true);
    setError(null);
    try {
      const href = badgePdfHref(group, employeeIds);
      const res = await fetch(href);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to download PDF.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const slug = group === "expat" ? "expats" : "saudis";
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `employee-badges-${slug}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => void handleDownload()}
        disabled={disabled || busy}
        className={className ?? "min-h-10 gap-1.5 px-3 sm:min-h-0"}
        aria-label={busy ? "Downloading PDF" : "Download badge PDF"}
      >
        <FileDown className="h-4 w-4 shrink-0" />
        {busy ? "Downloading…" : label}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
