"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Link2, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PatternMismatchBanner } from "@/components/pattern/PatternMismatchBanner";
import { productionBrandNameForOrder } from "@/lib/sales-orders/production-brand";
import type { PatternSalesOrderMismatch } from "@/lib/sales-orders/pattern-so-mismatch";
import type { PatternJob } from "@/lib/types/pattern";
import type { ClientPattern } from "@/lib/types/pattern-library";
import type { SalesOrder } from "@/lib/types/sales-orders";
import { cn } from "@/lib/utils";

function formatArticle(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

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

type PatternOrderBoardProps = {
  soId: string;
};

export function PatternOrderBoard({ soId }: PatternOrderBoardProps) {
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [jobs, setJobs] = useState<PatternJob[]>([]);
  const [mismatch, setMismatch] = useState<PatternSalesOrderMismatch | null>(null);
  const [awaitingLines, setAwaitingLines] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientPatterns, setClientPatterns] = useState<ClientPattern[]>([]);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [linkPatternId, setLinkPatternId] = useState("");
  const [linkVersionId, setLinkVersionId] = useState("");
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/orders/${soId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setOrder(data.order);
      setJobs(data.jobs ?? []);
      setMismatch(data.mismatch ?? null);
      setAwaitingLines(Boolean(data.awaiting_lines));
      setSelectedJobIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) {
          if ((data.jobs as PatternJob[] | undefined)?.some((job) => job.id === id)) {
            next.add(id);
          }
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [soId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch("/api/pattern/library/client-patterns", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setClientPatterns(data?.client_patterns ?? []))
      .catch(() => setClientPatterns([]));
  }, []);

  const garmentTypes = useMemo(() => {
    const types = new Set(jobs.map((job) => job.garment_type));
    return Array.from(types).sort();
  }, [jobs]);

  const houseBrand = useMemo(
    () => (order ? productionBrandNameForOrder(order) : null),
    [order]
  );

  const patternsForClient = useMemo(() => {
    if (!order) return clientPatterns;
    const forClient = clientPatterns.filter((pattern) => pattern.client_id === order.client_id);
    return forClient.length > 0 ? forClient : clientPatterns;
  }, [clientPatterns, order]);

  const selectedPattern = patternsForClient.find((pattern) => pattern.id === linkPatternId) ?? null;

  function toggleJob(jobId: string) {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  function toggleAll() {
    setSelectedJobIds((prev) => {
      if (prev.size === jobs.length) return new Set();
      return new Set(jobs.map((job) => job.id));
    });
  }

  async function setFirstTrial(jobId: string) {
    setActingId(jobId);
    try {
      const res = await fetch(`/api/pattern/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trial_priority: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Update failed");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setActingId(null);
    }
  }

  async function linkSelectedToPattern() {
    if (selectedJobIds.size === 0) {
      setError("Select at least one fabric line/job.");
      return;
    }

    setLinking(true);
    setError(null);
    try {
      const ids = Array.from(selectedJobIds);
      for (const jobId of ids) {
        const res = await fetch(`/api/pattern/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_pattern_id: linkPatternId || null,
            client_pattern_version_id: linkPatternId ? linkVersionId || null : null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Link failed");
      }
      setSelectedJobIds(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link failed");
    } finally {
      setLinking(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading order board…</p>;
  if (error && !order) return <p className="text-sm text-red-600">{error}</p>;
  if (!order) return <p className="text-sm text-slate-500">Order not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/pattern" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Pattern queue
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">
          {order.client_name} · {order.so_number}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {houseBrand ? `${houseBrand} · ` : ""}
          {order.client_code}
          {order.delivery_date ? ` · Delivery ${order.delivery_date}` : ""}
        </p>
        <p className="mt-2 text-sm text-slate-700">
          {jobs.length} fabric line{jobs.length === 1 ? "" : "s"} / job
          {jobs.length === 1 ? "" : "s"}
          {garmentTypes.length > 0 ? ` · ${garmentTypes.join(", ")}` : ""}
        </p>
        {awaitingLines ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Awaiting fabric lines — pattern jobs will appear when lines are added.
          </p>
        ) : null}
      </div>

      {mismatch ? <PatternMismatchBanner mismatch={mismatch} /> : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {garmentTypes.length > 0 ? (
        <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-900">
          <p className="font-medium">First trial priority</p>
          <p className="mt-1 text-violet-800">One first trial per garment type per order.</p>
          <ul className="mt-2 space-y-1">
            {garmentTypes.map((type) => {
              const trialJob = jobs.find((j) => j.garment_type === type && j.trial_priority);
              return (
                <li key={type}>
                  <span className="font-medium">{type}:</span>{" "}
                  {trialJob ? `${formatArticle(trialJob.article_number)} (${trialJob.piece_name})` : "Not set"}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-4">
          <div>
            <p className="font-medium text-slate-900">Consolidate to same master pattern</p>
            <p className="mt-1 text-sm text-slate-600">
              Select fabric lines that share one client pattern, then link them together.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Client pattern</span>
              <select
                value={linkPatternId}
                onChange={(e) => {
                  setLinkPatternId(e.target.value);
                  setLinkVersionId("");
                }}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Clear link / not linked</option>
                {patternsForClient.map((pattern) => (
                  <option key={pattern.id} value={pattern.id}>
                    {pattern.pattern_ref}
                    {pattern.house_brand_code ? ` · ${pattern.house_brand_code}` : ""}
                    {pattern.garment_type ? ` · ${pattern.garment_type}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Trial version</span>
              <select
                value={linkVersionId}
                onChange={(e) => setLinkVersionId(e.target.value)}
                disabled={!linkPatternId}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
              >
                <option value="">Latest / final</option>
                {(selectedPattern?.versions ?? []).map((version) => (
                  <option key={version.id} value={version.id}>
                    Trial {version.version}
                    {version.is_final ? " (Final)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void linkSelectedToPattern()}
              disabled={linking || selectedJobIds.size === 0}
            >
              <Link2 className="mr-1.5 h-4 w-4" />
              {linking
                ? "Linking…"
                : `Link selected (${selectedJobIds.size}) to same pattern`}
            </Button>
            <button
              type="button"
              onClick={toggleAll}
              className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
            >
              {selectedJobIds.size === jobs.length ? "Clear selection" : "Select all lines"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {jobs.map((job) => {
          const linked = clientPatterns.find((pattern) => pattern.id === job.client_pattern_id);
          const selected = selectedJobIds.has(job.id);
          return (
            <div
              key={job.id}
              className={cn(
                "rounded-xl border bg-white p-4",
                selected ? "border-indigo-300 ring-1 ring-indigo-100" : "border-slate-200"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 gap-3">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleJob(job.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600"
                    aria-label={`Select ${formatArticle(job.article_number)}`}
                  />
                  <div>
                    <p className="font-semibold text-slate-900">
                      {formatArticle(job.article_number)} · {job.garment_type} · {job.piece_name}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {job.fabric_number} · {job.supplier} · {job.meters}m
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {job.composition ?? "—"} · {job.gsm ?? "—"} gsm
                      {job.width_cm ? ` · ${job.width_cm} cm` : ""}
                      {job.color ? ` · ${job.color}` : ""}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">
                      {STATUS_LABELS[job.status] ?? job.status}
                      {job.assigned_to ? ` · ${job.assigned_to}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Master pattern:{" "}
                      {linked ? (
                        <Link
                          href={`/pattern/library/clients/${linked.id}`}
                          className="font-medium text-indigo-700 hover:text-indigo-900"
                        >
                          {linked.pattern_ref}
                        </Link>
                      ) : (
                        <span className="text-amber-700">Not linked</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Link href={`/pattern/jobs/${job.id}`} className="text-sm font-medium text-indigo-700">
                    Open job
                  </Link>
                  {!job.trial_priority ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void setFirstTrial(job.id)}
                      disabled={actingId === job.id}
                    >
                      <Star className="mr-1 h-3.5 w-3.5" />
                      {actingId === job.id ? "Saving…" : "Set first trial"}
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      First trial
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {!awaitingLines && jobs.length === 0 ? (
          <p className="text-sm text-slate-500">No pattern jobs for this order yet.</p>
        ) : null}
      </div>
    </div>
  );
}
