"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Droplets, Scissors } from "lucide-react";
import type { WashedReadyOverview, WashedReadyRow } from "@/lib/pattern-library/washed-ready";
import { cn } from "@/lib/utils";

const PREP_STEP_LABELS: Record<string, string> = {
  wash: "Washing",
  soak: "Soaking",
  drying: "Drying",
  iron: "Ironing",
};

function prepLabel(row: WashedReadyRow): string {
  if (row.status === "received") return "Awaiting prep";
  return PREP_STEP_LABELS[row.prep_step ?? ""] ?? "In prep";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Fabric-prep visibility for the pattern team: what's ready to cut vs still washing. */
export function WashedReadyPanel() {
  const [overview, setOverview] = useState<WashedReadyOverview | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/pattern/washed-ready?t=${Date.now()}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(setOverview)
      .catch(() => setOverview(null));
  }, []);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="text-sm font-semibold text-slate-800">Washed &amp; ready</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            <Scissors className="h-3 w-3" />
            {overview ? `${overview.ready.length} ready to cut` : "…"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">
            <Droplets className="h-3 w-3" />
            {overview ? `${overview.pending.length} in wash / prep` : "…"}
          </span>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="grid gap-4 border-t border-slate-100 p-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Ready to cut (prep complete)
            </p>
            {!overview || overview.ready.length === 0 ? (
              <p className="text-xs text-slate-400">No fabric handed off recently.</p>
            ) : (
              <ul className="space-y-1.5">
                {overview.ready.slice(0, 25).map((row) => (
                  <li
                    key={row.receipt_id}
                    className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-slate-800">
                      {row.so_number} · {row.garment_type}
                    </p>
                    <p className="text-xs text-slate-600">
                      {row.client_name} · {row.fabric_number} · {row.fabric_meters}m ·{" "}
                      iron done {formatDate(row.handed_off_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-700">
              Pending wash / prep
            </p>
            {!overview || overview.pending.length === 0 ? (
              <p className="text-xs text-slate-400">Nothing in fabric prep right now.</p>
            ) : (
              <ul className="space-y-1.5">
                {overview.pending.slice(0, 25).map((row) => (
                  <li
                    key={row.receipt_id}
                    className="rounded-lg border border-sky-100 bg-sky-50/50 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-slate-800">
                      {row.so_number} · {row.garment_type}
                      <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-700 ring-1 ring-sky-200">
                        {prepLabel(row)}
                      </span>
                    </p>
                    <p className="text-xs text-slate-600">
                      {row.client_name} · {row.fabric_number} · received {formatDate(row.received_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
