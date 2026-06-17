"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { PatternJob } from "@/lib/types/pattern";
import type { SalesOrder } from "@/lib/types/sales-orders";

function formatArticle(articleNumber: number): string {
  return `L${String(articleNumber).padStart(2, "0")}`;
}

type PatternOrderBoardProps = {
  soId: string;
};

export function PatternOrderBoard({ soId }: PatternOrderBoardProps) {
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [jobs, setJobs] = useState<PatternJob[]>([]);
  const [awaitingLines, setAwaitingLines] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/orders/${soId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setOrder(data.order);
      setJobs(data.jobs ?? []);
      setAwaitingLines(Boolean(data.awaiting_lines));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [soId]);

  useEffect(() => {
    void load();
  }, [load]);

  const garmentTypes = useMemo(() => {
    const types = new Set(jobs.map((job) => job.garment_type));
    return Array.from(types).sort();
  }, [jobs]);

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

  if (loading) return <p className="text-sm text-slate-500">Loading order board…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
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
          {order.so_number} · {order.client_name}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {order.client_code}
          {order.delivery_date ? ` · Delivery ${order.delivery_date}` : ""}
        </p>
        {awaitingLines ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Awaiting fabric lines — pattern jobs will appear when lines are added.
          </p>
        ) : null}
      </div>

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

      <div className="space-y-3">
        {jobs.map((job) => (
          <div key={job.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
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
                <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">{job.status}</p>
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
        ))}

        {!awaitingLines && jobs.length === 0 ? (
          <p className="text-sm text-slate-500">No pattern jobs for this order yet.</p>
        ) : null}
      </div>
    </div>
  );
}
