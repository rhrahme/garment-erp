"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, Star } from "lucide-react";
import { FactoryBrandTabs } from "@/components/brands/FactoryBrandTabs";
import { Button } from "@/components/ui/Button";
import { useFactoryBrandFilter } from "@/hooks/useFactoryBrandFilter";
import { useMeasurementUnitPreference } from "@/hooks/useMeasurementUnitPreference";
import { getBrandClientCodePrefix } from "@/lib/clients/codes";
import { orderMatchesBrandClientPrefix } from "@/lib/clients/orphan-reconciliation";
import { groupPatternJobsBySalesOrder } from "@/lib/pattern/queue-groups";
import { jobMatchesTab } from "@/lib/pattern/work-tabs";
import { matchesNormalizedSearch } from "@/lib/search/normalize";
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
  /** Controlled brand filter; when omitted, uses shared localStorage preference. */
  brandId?: string | null;
  /** Hide chips when parent already renders FactoryBrandTabs. */
  hideBrandTabs?: boolean;
};

export function PatternWorkList({
  reloadKey = 0,
  brandId: brandIdProp,
  hideBrandTabs = false,
}: PatternWorkListProps) {
  const [tab, setTab] = useState<PatternWorkTab>("new");
  const [overview, setOverview] = useState<PatternOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoSummary, setAutoSummary] = useState<string | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);
  const { unit: measurementUnit } = useMeasurementUnitPreference();
  const { brandId: storedBrandId, setBrandId, hydrated } = useFactoryBrandFilter();
  const brandId = brandIdProp !== undefined ? brandIdProp : storedBrandId;

  const brandPrefix = brandId ? getBrandClientCodePrefix(brandId) : null;

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/pattern/overview", { cache: "no-store" });
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

  const brandScopedJobs = useMemo(() => {
    if (!overview) return [];
    if (!brandPrefix) return overview.jobs;
    return overview.jobs.filter((row) =>
      orderMatchesBrandClientPrefix(row.job.client_code, brandPrefix)
    );
  }, [brandPrefix, overview]);

  const brandScopedAwaiting = useMemo(() => {
    if (!overview) return [];
    if (!brandPrefix) return overview.awaiting_lines_orders;
    return overview.awaiting_lines_orders.filter((order) =>
      orderMatchesBrandClientPrefix(order.client_code, brandPrefix)
    );
  }, [brandPrefix, overview]);

  const filteredJobs = useMemo(() => {
    return brandScopedJobs.filter((row) => {
      if (!jobMatchesTab(row.job.status, tab)) return false;
      const { job } = row;
      return matchesNormalizedSearch(
        [
          job.so_number,
          job.client_name,
          job.client_code,
          job.garment_type,
          job.fabric_number,
          formatArticle(job.article_number),
          row.retail_brand ?? "",
          row.house_brand ?? "",
        ],
        search
      );
    });
  }, [brandScopedJobs, tab, search]);

  const orderGroups = useMemo(() => groupPatternJobsBySalesOrder(filteredJobs), [filteredJobs]);

  const awaitingOrders = useMemo(() => {
    if (tab !== "new") return [];
    return brandScopedAwaiting.filter((order) =>
      matchesNormalizedSearch([order.so_number, order.client_name, order.client_code], search)
    );
  }, [brandScopedAwaiting, tab, search]);

  const tabCounts = useMemo(() => {
    const counts = Object.fromEntries(TABS.map((t) => [t.id, 0])) as Record<PatternWorkTab, number>;

    for (const t of TABS) {
      const matching = brandScopedJobs.filter((row) => jobMatchesTab(row.job.status, t.id));
      const soIds = new Set(matching.map((row) => row.job.sales_order_id));
      counts[t.id] = soIds.size;
    }
    // Awaiting-lines SOs only appear on New.
    counts.new += brandScopedAwaiting.length;
    return counts;
  }, [brandScopedAwaiting, brandScopedJobs]);

  async function autoConsolidateAll() {
    setAutoBusy(true);
    setAutoSummary(null);
    setAutoError(null);
    try {
      const res = await fetch("/api/pattern/auto-consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit: measurementUnit }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Auto-consolidate failed");
      setAutoSummary(
        `Groups ${data.groups_formed ?? 0} | linked ${data.jobs_linked ?? 0} jobs | created ${
          data.patterns_created ?? 0
        } patterns | reused ${data.patterns_reused ?? 0}` +
          (data.cross_client_fit_families?.length
            ? ` | ${data.cross_client_fit_families.length} cross-client fit families`
            : "")
      );
      await loadOverview(true);
    } catch (err) {
      setAutoError(err instanceof Error ? err.message : "Auto-consolidate failed");
    } finally {
      setAutoBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!hideBrandTabs && hydrated ? (
        <FactoryBrandTabs
          value={brandId}
          onChange={setBrandId}
          showAll
          allLabel="All brands"
          label="Filter by brand"
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3">
        <p className="text-sm text-indigo-950">
          Auto-group pattern jobs by garment + composition + gsm (per client sheets; cross-client
          fit families are shown for visibility only).
        </p>
        <Button size="sm" variant="secondary" onClick={() => void autoConsolidateAll()} disabled={autoBusy}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          {autoBusy ? "Auto-consolidating..." : "Auto-consolidate by composition/weight"}
        </Button>
      </div>
      {autoSummary ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{autoSummary}</p>
      ) : null}
      {autoError ? <p className="text-sm text-red-600">{autoError}</p> : null}

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
        placeholder="Search SO, client, fabric, garment..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      {loading && !overview ? (
        <p className="text-sm text-slate-500">Loading pattern queue...</p>
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
                    {order.client_name} · {order.so_number}
                  </p>
                  <p className="mt-1 text-sm text-amber-800">Awaiting fabric lines</p>
                  <p className="mt-1 text-xs text-slate-500">{order.client_code}</p>
                </div>
                <Link
                  href={`/pattern/orders/${order.sales_order_id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
                >
                  Open
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ))}

          {orderGroups.map((group) => (
            <div
              key={group.sales_order_id}
              className={cn(
                "rounded-xl border bg-white p-4 shadow-sm",
                group.has_trial_priority ? "border-violet-300 ring-1 ring-violet-100" : "border-slate-200"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">
                      {group.client_name} · {group.so_number}
                    </p>
                    {group.has_trial_priority ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                        <Star className="h-3 w-3 fill-current" />
                        First trial
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {group.house_brand ? `${group.house_brand} · ` : ""}
                    {group.client_code}
                    {group.order_delivery_date ? ` · Delivery ${group.order_delivery_date}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    {group.fabric_line_count} fabric line{group.fabric_line_count === 1 ? "" : "s"}
                    {" · "}
                    {group.job_count} job{group.job_count === 1 ? "" : "s"}
                    {group.garment_types.length > 0
                      ? ` · ${group.garment_types.join(", ")}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    {group.status_summary.map((status) => STATUS_LABELS[status] ?? status).join(" · ")}
                    {group.unlinked_job_count > 0
                      ? ` · ${group.unlinked_job_count} unlinked to master pattern`
                      : group.linked_pattern_count > 0
                        ? " · All linked to master pattern"
                        : ""}
                  </p>
                </div>
                <Link
                  href={`/pattern/orders/${group.sales_order_id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
                >
                  Open
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ))}

          {awaitingOrders.length === 0 && orderGroups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No sales orders in this tab.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
