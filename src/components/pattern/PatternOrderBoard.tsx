"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Eye, ImageOff, Layers, Star, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FabricSwatchPreview } from "@/components/fabric/FabricSwatchPreview";
import { FabricSwatchProvider, useFabricSwatch } from "@/components/fabric/FabricSwatchProvider";
import { PatternMismatchBanner } from "@/components/pattern/PatternMismatchBanner";
import { productionBrandNameForOrder } from "@/lib/sales-orders/production-brand";
import type { PatternSalesOrderMismatch } from "@/lib/sales-orders/pattern-so-mismatch";
import type { PatternJob } from "@/lib/types/pattern";
import type { ClientPattern } from "@/lib/types/pattern-library";
import type { SalesOrder } from "@/lib/types/sales-orders";

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
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);

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
    if (!order) return [];
    return clientPatterns.filter((pattern) => pattern.client_id === order.client_id);
  }, [clientPatterns, order]);

  const swatchKeys = useMemo(
    () =>
      jobs
        .filter((job) => job.supplier_id && job.fabric_number)
        .map((job) => ({
          supplier_id: job.supplier_id as string,
          fabric_number: job.fabric_number,
        })),
    [jobs]
  );

  const previewJob = useMemo(
    () => jobs.find((job) => job.id === previewJobId) ?? null,
    [jobs, previewJobId]
  );

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
  if (error && !order) return <p className="text-sm text-red-600">{error}</p>;
  if (!order) return <p className="text-sm text-slate-500">Order not found.</p>;

  return (
    <FabricSwatchProvider fabrics={swatchKeys}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/pattern"
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
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
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/pattern/library"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Layers className="h-4 w-4" />
              Pattern Library
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href={`/pattern/library/fabrics/${order.client_id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Fabric board
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Create or open this client&apos;s garment sheet in Pattern Library (Custom or filtered
            library base). Assign fabrics on the fabric board.
          </p>
          {patternsForClient.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {patternsForClient.map((pattern) => (
                <li key={pattern.id}>
                  <Link
                    href={`/pattern/library/clients/${pattern.id}`}
                    className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-800"
                  >
                    {pattern.pattern_ref} · {pattern.garment_type}
                  </Link>
                </li>
              ))}
            </ul>
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
                    {trialJob
                      ? `${formatArticle(trialJob.article_number)} (${trialJob.piece_name})`
                      : "Not set"}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="space-y-3">
          {jobs.map((job) => {
            const linked = clientPatterns.find((pattern) => pattern.id === job.client_pattern_id);
            const supplierId = job.supplier_id ?? "";
            return (
              <div key={job.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 gap-3">
                    {supplierId ? (
                      <button
                        type="button"
                        onClick={() => setPreviewJobId(job.id)}
                        className="shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        aria-label={`Preview fabric ${job.fabric_number}`}
                        title="Preview fabric"
                      >
                        <FabricSwatchPreview
                          supplierId={supplierId}
                          fabricNumber={job.fabric_number}
                          className="!h-14 !w-14 rounded-lg [&_img]:!h-full [&_img]:!w-full"
                        />
                      </button>
                    ) : (
                      <div
                        className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300"
                        aria-hidden
                      >
                        <ImageOff className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">
                        {formatArticle(job.article_number)} · {job.garment_type} · {job.piece_name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p className="text-sm text-slate-600">
                          {job.fabric_number} · {job.supplier} · {job.meters}m
                        </p>
                        {supplierId ? (
                          <button
                            type="button"
                            onClick={() => setPreviewJobId(job.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
                            aria-label={`Preview fabric ${job.fabric_number}`}
                            title="Preview fabric"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
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
                          <span className="text-amber-700">Not linked yet — use Pattern Library</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Link
                      href={`/pattern/jobs/${job.id}`}
                      className="text-sm font-medium text-indigo-700"
                    >
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

        {previewJob?.supplier_id ? (
          <JobFabricPreviewDialog job={previewJob} onClose={() => setPreviewJobId(null)} />
        ) : null}
      </div>
    </FabricSwatchProvider>
  );
}

function JobFabricPreviewDialog({
  job,
  onClose,
}: {
  job: PatternJob;
  onClose: () => void;
}) {
  const getSwatch = useFabricSwatch();
  const supplierId = job.supplier_id ?? "";
  const urls = supplierId ? getSwatch?.(supplierId, job.fabric_number) : undefined;
  const src = urls?.zoom ?? urls?.square;
  const [failed, setFailed] = useState(false);
  const article = formatArticle(job.article_number);

  useEffect(() => {
    setFailed(false);
  }, [src, job.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Fabric ${article}`}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-lg font-bold text-slate-900">{article}</p>
            <p className="mt-0.5 text-sm text-slate-600">
              <span className="font-mono">{job.fabric_number}</span> · {job.supplier}
            </p>
            {job.composition ? (
              <p className="mt-1 text-xs text-slate-500">{job.composition}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {!src || failed ? (
          <div
            className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400"
            aria-label={`No photo for fabric ${job.fabric_number}`}
          >
            <ImageOff className="h-8 w-8" />
            <p className="text-sm font-medium text-slate-500">No photo</p>
            <p className="text-xs text-slate-400">No swatch image for {job.fabric_number}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Fabric ${job.fabric_number}`}
              className="aspect-[4/3] w-full object-cover"
              onError={() => setFailed(true)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
