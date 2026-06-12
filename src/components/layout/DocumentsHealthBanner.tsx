"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export function DocumentsHealthBanner() {
  const [issue, setIssue] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/health/documents");
        if (!res.ok) return;
        const data = (await res.json()) as { ok?: boolean; missing?: string[]; error?: string };
        if (cancelled || data.ok) return;

        const missing = data.missing?.length
          ? `Missing suppliers: ${data.missing.join(", ")}`
          : (data.error ?? "ERP document health check failed");
        setIssue(missing);
      } catch {
        // Non-admin or network — hide banner.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!issue) return null;

  return (
    <div className="border-b border-red-200 bg-red-50 px-8 py-3 text-sm text-red-950">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-red-700" />
        <span>
          <strong>Data integrity warning:</strong> {issue}. Order saves may fail until this is fixed.
        </span>
      </div>
    </div>
  );
}
