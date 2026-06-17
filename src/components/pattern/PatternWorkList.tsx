"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { jobMatchesTab } from "@/lib/pattern/overview";
import type { PatternOverview, PatternWorkTab } from "@/lib/types/pattern";
import { cn } from "@/lib/utils";

const TABS: { id: PatternWorkTab; label: string; hint: string }[] = [
  { id: "new", label: "New", hint: "Pending or assigned jobs" },
  { id: "drafting", label: "Drafting", hint: "Pattern being drafted" },
  { id: "in_fittings", label: "In fittings", hint: "Awaiting client fitting" },
  { id: "revising", label: "Revising", hint: "Adjustments after fitting" },
  { id: "ready_for_cutting", label: "Ready for cutting", hint: "Approved patterns" },
  { id: "blocked", label: "Blocked", hint: "Needs attention" },
  { id: "completed", label: "Completed", hint: "Done or cancelled" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  assigned: "Assigned",
  drafting: "Drafting",
  awaiting_fitting: "Awaiting fitting",
  revising: "Revising",
  ready_for_cutting: "Ready for cutting",
  completed: "Completed",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

function formatArticle(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

type PatternWorkListProps = {
  reloadKey?: number;
};

export function PatternWorkList({ reloadKey = 0 }: PatternWorkListProps) {
  const [tab, setTab] = useState<PatternWorkTab>("new");
  const [overview, setOverview] = useState<PatternOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/pattern/overview?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load");
      setOverview(await res.json());
    } catch {
      setOverview(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview(reloadKey > 0);
  }, [loadOverview, reloadKey]);

  const tabCounts = useMemo(() => {
    const counts = Object.fromEntries(TABS.map((t) => [t.id, 0])) as Record<PatternWorkTab, number>;
    if (!overview) return counts;

    for (const row of overview.jobs) {
      for (const t of TABS) {
        if (jobMatchesTab(row.job.status, t.id)) counts[t.id] += 1;
      }
    }
    if (tab === "new") {
      counts.new += overview.awaiting_lines_orders.length;
    }
    return counts;
  }, [overview]);

  const filteredJobs = useMemo(() => {
    if (!overview) return [];
    const q = search.trim().toUpperCase();
    return overview.jobs.filter((row) => {
      if (!jobMatchesTab(row.job.status, tab)) return false;
      if (!q) return true;
      const { job } = row;
      return (
        job.so_number.toUpperCase().includes(q) ||
        job.client_name.toUpperCase().includes(q) ||
        job.client_code.toUpperCase().includes(q) ||
        job.garment_type.toUpperCase().includes(q) ||
        job.fabric_number.toUpperCase().includes(q) ||
        formatArticle(job.article_number).includes(q)
      );
    });
  }, [overview, tab, search]);

  const awaitingOrders = useMemo(() => {
    if (!overview || tab !== "new") return [];
    const q = search.trim().toUpperCase();
    return overview.awaiting_lines_orders.filter((order) => {
      if (!q) return true;
      return (
        order.so_number.toUpperCase().includes(q) ||
        order.client_name.toUpperCase().includes(q) ||
        order.client_code.toUpperCase().includes(q)
      );
    });
  }, [overview, tab, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            title={t.hint}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            )}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-80">({tabCounts[t.id] ?? 0})</span>
          </button>
        ))}
      </div>

      <input
        type="search"
        placeholder="Search SO, client, fabric, garment…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      {loading && !overview ? (
        <p className="text-sm text-slate-500">Loading pattern queue…</p>
      ) : (
        <div className="space-y-3">
          {awaitingOrders.map((order) => (
            <div
              key={order.sales_order_id}
              className="rounded-xl border border-amber-200 bg-amber-50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {order.so_number} · {order.client_name}
                  </p>
                  <p className="mt-1 text-sm text-amber-800">Awaiting fabric lines</p>
                </div>
                <Link
                  href={`/pattern/orders/${order.sales_order_id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
                >
                  Open order
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ))}

          {filteredJobs.map(({ job, order_delivery_date }) => (
            <div
              key={job.id}
              className={cn(
                "rounded-xl border bg-white p-4 shadow-sm",
                job.trial_priority ? "border-violet-300 ring-1 ring-violet-100" : "border-slate-200"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">
                      {job.so_number} · {formatArticle(job.article_number)} · {job.garment_type}
                    </p>
                    {job.trial_priority ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                        <Star className="h-3 w-3 fill-current" />
                        First trial
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {job.client_name} · {job.fabric_number} · {job.supplier}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {job.composition ?? "—"} · {job.gsm ?? "—"} gsm · {job.meters}m
                    {order_delivery_date ? ` · Delivery ${order_delivery_date}` : ""}
                  </p>
                  <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    {STATUS_LABELS[job.status] ?? job.status}
                    {job.assigned_to ? ` · ${job.assigned_to}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Link
                    href={`/pattern/jobs/${job.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
                  >
                    Open job
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/pattern/orders/${job.sales_order_id}`}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Order board
                  </Link>
                </div>
              </div>
            </div>
          ))}

          {awaitingOrders.length === 0 && filteredJobs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No jobs in this tab.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
