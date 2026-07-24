"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { matchesNormalizedSearch } from "@/lib/search/normalize";
import {
  THREAD_BUTTON_MATCH_STATUSES,
  type ThreadButtonMatchComponent,
  type ThreadButtonMatchListFilter,
  type ThreadButtonMatchListItem,
  type ThreadButtonMatchStatus,
  type ThreadButtonMatchSummary,
} from "@/lib/types/thread-button-matching";
import { cn } from "@/lib/utils";

const FILTERS: { id: ThreadButtonMatchListFilter; label: string }[] = [
  { id: "needs_matching", label: "Needs matching" },
  { id: "needs_attention", label: "Needs attention" },
  { id: "missing", label: "Missing" },
  { id: "decision_needed", label: "Decision" },
  { id: "done", label: "Confirmed" },
  { id: "all", label: "All" },
];

function formatArticle(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

function statusButtonClass(
  status: ThreadButtonMatchStatus,
  selected: boolean
): string {
  if (!selected) {
    return "border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  }
  if (status === "confirmed") {
    return "border-emerald-600 bg-emerald-600 text-white";
  }
  if (status === "missing") {
    return "border-rose-600 bg-rose-600 text-white";
  }
  return "border-amber-500 bg-amber-500 text-white";
}

function statusChipClass(status: ThreadButtonMatchStatus): string {
  if (status === "confirmed") return "bg-emerald-100 text-emerald-800";
  if (status === "missing") return "bg-rose-100 text-rose-800";
  if (status === "decision_needed") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-600";
}

function statusLabel(status: ThreadButtonMatchStatus): string {
  if (status === "pending") return "Not set";
  return THREAD_BUTTON_MATCH_STATUSES.find((item) => item.id === status)?.label ?? status;
}

function formatAudit(at: string | null, by: string | null): string | null {
  if (!at && !by) return null;
  const when = at
    ? new Date(at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  if (when && by) return `${when} · ${by}`;
  return when ?? by;
}

function MatchComponentRow({
  label,
  component,
  status,
  updatedAt,
  updatedBy,
  busy,
  onSetStatus,
}: {
  label: string;
  component: ThreadButtonMatchComponent;
  status: ThreadButtonMatchStatus;
  updatedAt: string | null;
  updatedBy: string | null;
  busy: boolean;
  onSetStatus: (component: ThreadButtonMatchComponent, status: ThreadButtonMatchStatus) => void;
}) {
  const audit = formatAudit(updatedAt, updatedBy);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold text-slate-900">{label}</p>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            statusChipClass(status)
          )}
        >
          {statusLabel(status)}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {THREAD_BUTTON_MATCH_STATUSES.map((option) => {
          const selected = status === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={busy}
              onClick={() => onSetStatus(component, option.id)}
              className={cn(
                "min-h-[52px] rounded-xl border-2 px-3 py-3 text-left transition-colors disabled:opacity-60",
                statusButtonClass(option.id, selected)
              )}
            >
              <span className="block text-sm font-semibold leading-tight">{option.label}</span>
              <span
                className={cn(
                  "mt-0.5 block text-xs leading-tight",
                  selected ? "text-white/90" : "text-slate-500"
                )}
              >
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>
      {audit ? <p className="mt-2 text-xs text-slate-500">{audit}</p> : null}
    </div>
  );
}

export function ThreadButtonMatchingWorkspace({
  readOnly = false,
}: {
  readOnly?: boolean;
}) {
  const [filter, setFilter] = useState<ThreadButtonMatchListFilter>("needs_matching");
  const [items, setItems] = useState<ThreadButtonMatchListItem[]>([]);
  const [summary, setSummary] = useState<ThreadButtonMatchSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async (nextFilter: ThreadButtonMatchListFilter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/thread-button-matching?filter=${encodeURIComponent(nextFilter)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load matches.");
      setItems(data.items ?? []);
      setSummary(data.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load matches.");
      setItems([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const visibleItems = useMemo(() => {
    if (!search.trim()) return items;
    return items.filter((item) =>
      matchesNormalizedSearch(
        [
          item.so_number,
          item.client_name,
          item.client_code,
          item.fabric_number,
          item.garment_type,
          item.fabric_cut_code,
          formatArticle(item.article_number),
        ],
        search
      )
    );
  }, [items, search]);

  async function setStatus(
    item: ThreadButtonMatchListItem,
    component: ThreadButtonMatchComponent,
    status: ThreadButtonMatchStatus
  ) {
    if (readOnly) return;
    const key = `${item.sales_order_line_id}:${component}`;
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch("/api/thread-button-matching", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sales_order_line_id: item.sales_order_line_id,
          component,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update status.");
      await load(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((tab) => {
            const count =
              tab.id === "needs_matching"
                ? summary?.needs_matching
                : tab.id === "needs_attention"
                  ? summary?.needs_attention
                  : tab.id === "missing"
                    ? summary?.missing
                    : tab.id === "decision_needed"
                      ? summary?.decision_needed
                      : tab.id === "done"
                        ? summary?.done
                        : summary?.total;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={cn(
                  "min-h-[44px] rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors",
                  filter === tab.id
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                )}
              >
                {tab.label}
                {typeof count === "number" ? (
                  <span className="ml-1.5 opacity-80">({count})</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="secondary"
          className="min-h-[44px] self-start"
          onClick={() => void load(filter)}
          disabled={loading}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search client, SO, fabric, cut code…"
          className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-base text-slate-900 outline-none ring-indigo-500 focus:ring-2"
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading fabric articles…
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center text-slate-500">
          No fabric articles in this view.
        </div>
      ) : (
        <ul className="space-y-4">
          {visibleItems.map((item) => {
            const threadBusy = busyKey === `${item.sales_order_line_id}:thread`;
            const buttonBusy = busyKey === `${item.sales_order_line_id}:button`;
            return (
              <li
                key={item.sales_order_line_id}
                className={cn(
                  "rounded-2xl border bg-white p-4 shadow-sm sm:p-5",
                  item.needs_attention
                    ? "border-amber-300"
                    : item.is_fully_matched
                      ? "border-emerald-200"
                      : "border-slate-200"
                )}
              >
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-lg font-bold text-slate-900">{item.client_name}</p>
                    <p className="text-sm text-slate-600">
                      {item.so_number} · {formatArticle(item.article_number)} ·{" "}
                      <span className="font-medium text-slate-800">{item.fabric_number}</span>
                    </p>
                    <p className="text-sm text-slate-500">
                      {item.garment_type} · {item.fabric_cut_code} · {item.scan_stage_label}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <MatchComponentRow
                    label="Thread"
                    component="thread"
                    status={item.thread_status}
                    updatedAt={item.thread_updated_at}
                    updatedBy={item.thread_updated_by}
                    busy={Boolean(busyKey) || readOnly}
                    onSetStatus={(component, status) => void setStatus(item, component, status)}
                  />
                  <MatchComponentRow
                    label="Buttons"
                    component="button"
                    status={item.button_status}
                    updatedAt={item.button_updated_at}
                    updatedBy={item.button_updated_by}
                    busy={Boolean(busyKey) || readOnly}
                    onSetStatus={(component, status) => void setStatus(item, component, status)}
                  />
                </div>
                {(threadBusy || buttonBusy) && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
