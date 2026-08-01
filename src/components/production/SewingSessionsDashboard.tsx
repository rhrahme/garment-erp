"use client";

import { useCallback, useEffect, useState } from "react";
import type { SewingSession } from "@/lib/types/sewing-sessions";
import { cn } from "@/lib/utils";

type DashboardPayload = {
  open_sessions: SewingSession[];
  closed_today: number;
  completed_by_employee: { employee_name: string; count: number; duration_sec: number }[];
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function SewingSessionsDashboard({ className }: { className?: string }) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/production/sewing-session");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json as DashboardPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sewing sessions");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white", className)}>
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Sewing floor now</h2>
            <p className="mt-1 text-sm text-slate-500">
              Live stitcher sessions from laptop kiosks (badge + A4 QR).
            </p>
          </div>
          <a
            href="/stitch"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Open stitch kiosk
          </a>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-4 text-sm">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-slate-500">Open now</span>{" "}
            <span className="font-semibold tabular-nums text-slate-900">
              {data?.open_sessions.length ?? "-"}
            </span>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-slate-500">Closed today</span>{" "}
            <span className="font-semibold tabular-nums text-slate-900">
              {data?.closed_today ?? "-"}
            </span>
          </div>
        </div>

        {data && data.open_sessions.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {data.open_sessions.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-900">{session.employee_name}</p>
                  <p className="text-slate-500">
                    {session.production_code}
                    {session.piece_mark ? ` - ${session.piece_mark}` : ""}
                    {session.client_name ? ` - ${session.client_name}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    session.status === "closing"
                      ? "bg-sky-100 text-sky-800"
                      : "bg-emerald-100 text-emerald-800"
                  )}
                >
                  {session.status === "closing" ? "Closing" : "Sewing"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No open sewing sessions.</p>
        )}

        {data && data.completed_by_employee.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Completed today
            </p>
            <ul className="space-y-1 text-sm">
              {data.completed_by_employee.slice(0, 8).map((row) => (
                <li key={row.employee_name} className="flex justify-between gap-3 text-slate-700">
                  <span>{row.employee_name}</span>
                  <span className="tabular-nums text-slate-500">
                    {row.count} pcs / {formatDuration(row.duration_sec)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
