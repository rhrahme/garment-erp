"use client";

import { useCallback, useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { StitchKioskSettingsFile } from "@/lib/types/stitch-kiosk-settings";
import { cn } from "@/lib/utils";

export function StitchKioskPauseControl({ className }: { className?: string }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [settings, setSettings] = useState<StitchKioskSettingsFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
      const session = sessionRes.ok ? await sessionRes.json() : null;
      const admin = Boolean(session?.is_admin);
      setIsAdmin(admin);
      if (!admin) return;
      const res = await fetch("/api/admin/stitch-kiosk-pause", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to load pause state.");
      setSettings(data.settings as StitchKioskSettingsFile);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pause state.");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(id);
  }, [load]);

  if (!isAdmin) return null;

  async function toggle() {
    if (!settings || busy) return;
    const nextPaused = !settings.paused;
    const label = nextPaused
      ? "Pause the stitch kiosk? Floor badge/A4 scans will be blocked until you resume."
      : "Resume the stitch kiosk? Floor scans will accept work again.";
    if (!window.confirm(label)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stitch-kiosk-pause", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: nextPaused }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to update pause state.");
      setSettings(data.settings as StitchKioskSettingsFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pause state.");
    } finally {
      setBusy(false);
    }
  }

  const paused = Boolean(settings?.paused);

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        paused ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className={cn("text-sm font-medium", paused ? "text-amber-950" : "text-slate-800")}>
          {paused ? "Stitch kiosk paused" : "Stitch kiosk active"}
        </p>
        <Button
          size="sm"
          variant={paused ? "primary" : "secondary"}
          onClick={() => void toggle()}
          disabled={busy || !settings}
        >
          {paused ? (
            <>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              {busy ? "Resuming..." : "Resume kiosk"}
            </>
          ) : (
            <>
              <Pause className="mr-1.5 h-3.5 w-3.5" />
              {busy ? "Pausing..." : "Pause kiosk"}
            </>
          )}
        </Button>
      </div>
      {paused && settings?.paused_by ? (
        <p className="mt-1 text-xs text-amber-900/80">
          Paused by {settings.paused_by}
          {settings.paused_at ? ` � ${new Date(settings.paused_at).toLocaleString()}` : ""}
        </p>
      ) : null}
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
