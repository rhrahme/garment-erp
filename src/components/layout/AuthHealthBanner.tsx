"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export function AuthHealthBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/health/auth");
        if (!res.ok) return;
        const data = (await res.json()) as { degraded?: boolean; message?: string | null };
        if (cancelled || !data.degraded) return;
        setMessage(data.message ?? "Authentication service was recently unavailable.");
      } catch {
        // Hide banner on network errors.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!message) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-8 py-3 text-sm text-amber-950">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
        <span>
          <strong>Auth service warning:</strong> {message}
        </span>
      </div>
    </div>
  );
}
