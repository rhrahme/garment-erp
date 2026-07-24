"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { PatternFittingOutcome, PatternJob, PatternJobStatus } from "@/lib/types/pattern";
import type { ClientPattern } from "@/lib/types/pattern-library";

const STATUSES: PatternJobStatus[] = [
  "pending",
  "assigned",
  "drafting",
  "awaiting_fitting",
  "revising",
  "ready_for_cutting",
  "completed",
  "blocked",
  "cancelled",
];

const OUTCOMES: PatternFittingOutcome[] = ["pass", "adjust", "fail", "cancelled", "no_show"];

type PatternJobDetailProps = {
  jobId: string;
};

export function PatternJobDetail({ jobId }: PatternJobDetailProps) {
  const [job, setJob] = useState<PatternJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assignedTo, setAssignedTo] = useState("");
  const [patternCode, setPatternCode] = useState("");
  const [sizeNotes, setSizeNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [blockedReason, setBlockedReason] = useState("");
  const [status, setStatus] = useState<PatternJobStatus>("pending");
  const [revisionSummary, setRevisionSummary] = useState("");
  const [fittingNotes, setFittingNotes] = useState("");
  const [fittingOutcome, setFittingOutcome] = useState<PatternFittingOutcome>("pass");
  const [selectedFittingId, setSelectedFittingId] = useState("");
  const [uploadRevisionId, setUploadRevisionId] = useState("");
  const [clientPatterns, setClientPatterns] = useState<ClientPattern[]>([]);
  const [linkedPatternId, setLinkedPatternId] = useState("");
  const [linkedVersionId, setLinkedVersionId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/jobs/${jobId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      const nextJob = data.job as PatternJob;
      setJob(nextJob);
      setAssignedTo(nextJob.assigned_to ?? "");
      setPatternCode(nextJob.pattern_code ?? "");
      setSizeNotes(nextJob.pattern_size_notes ?? "");
      setNotes(nextJob.notes ?? "");
      setBlockedReason(nextJob.blocked_reason ?? "");
      setStatus(nextJob.status);
      setLinkedPatternId(nextJob.client_pattern_id ?? "");
      setLinkedVersionId(nextJob.client_pattern_version_id ?? "");
      const scheduled = nextJob.fittings.find((f) => f.status === "scheduled");
      setSelectedFittingId(scheduled?.id ?? nextJob.fittings[nextJob.fittings.length - 1]?.id ?? "");
      setUploadRevisionId(nextJob.revisions[nextJob.revisions.length - 1]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch("/api/pattern/library/client-patterns", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setClientPatterns(data?.client_patterns ?? []))
      .catch(() => setClientPatterns([]));
  }, []);

  async function saveMasterPatternLink() {
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_pattern_id: linkedPatternId || null,
          client_pattern_version_id: linkedVersionId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setJob(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setActing(false);
    }
  }

  async function saveJob() {
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          assigned_to: assignedTo || null,
          pattern_code: patternCode || null,
          pattern_size_notes: sizeNotes || null,
          notes: notes || null,
          blocked_reason: blockedReason || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setJob(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setActing(false);
    }
  }

  async function scheduleFitting() {
    setActing(true);
    try {
      const res = await fetch(`/api/pattern/jobs/${jobId}/fittings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "schedule", notes: fittingNotes || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  async function completeFitting() {
    if (!selectedFittingId) return;
    setActing(true);
    try {
      const res = await fetch(`/api/pattern/jobs/${jobId}/fittings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          fitting_id: selectedFittingId,
          outcome: fittingOutcome,
          notes: fittingNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  async function addRevision() {
    setActing(true);
    try {
      const res = await fetch(`/api/pattern/jobs/${jobId}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes_summary: revisionSummary || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setRevisionSummary("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  async function uploadFile(revisionId: string, file: File) {
    setActing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/pattern/jobs/${jobId}/revisions/${revisionId}/files`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setActing(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading job…</p>;
  if (!job) return <p className="text-sm text-slate-500">Job not found.</p>;

  return (
    <div className="space-y-6">
      <Link href={`/pattern/orders/${job.sales_order_id}`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />
        Back to order board
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">
          {job.so_number} · L{String(job.article_number).padStart(2, "0")} · {job.garment_type}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {job.client_name} · {job.fabric_number} · {job.supplier} · {job.meters}m
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {job.composition ?? "—"} · {job.gsm ?? "—"} gsm · {job.color ?? "—"}
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Job details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PatternJobStatus)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Assigned to</span>
            <input
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Pattern code</span>
            <input
              value={patternCode}
              onChange={(e) => setPatternCode(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">Size notes</span>
            <textarea
              value={sizeNotes}
              onChange={(e) => setSizeNotes(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-slate-700">Blocked reason</span>
            <input
              value={blockedReason}
              onChange={(e) => setBlockedReason(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <Button onClick={() => void saveJob()} disabled={acting}>
          {acting ? "Saving…" : "Save job"}
        </Button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Master pattern (library)</h3>
        <p className="text-xs text-slate-500">
          Link this job to the client&apos;s master pattern + trial so cutting uses the right
          measurement sheet.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Client pattern</span>
            <select
              value={linkedPatternId}
              onChange={(e) => {
                setLinkedPatternId(e.target.value);
                setLinkedVersionId("");
              }}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Not linked</option>
              {clientPatterns.map((pattern) => (
                <option key={pattern.id} value={pattern.id}>
                  {pattern.pattern_ref} — {pattern.client_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Trial version</span>
            <select
              value={linkedVersionId}
              onChange={(e) => setLinkedVersionId(e.target.value)}
              disabled={!linkedPatternId}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            >
              <option value="">Latest / final</option>
              {(clientPatterns.find((pattern) => pattern.id === linkedPatternId)?.versions ?? []).map(
                (version) => (
                  <option key={version.id} value={version.id}>
                    Trial {version.version}
                    {version.is_final ? " (Final)" : ""}
                  </option>
                )
              )}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void saveMasterPatternLink()} disabled={acting}>
            {acting ? "Saving…" : "Save link"}
          </Button>
          {job.client_pattern_id ? (
            <>
              <Link
                href={`/pattern/library/clients/${job.client_pattern_id}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
              >
                Open master pattern
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={`/pattern/client-patterns/${job.client_pattern_id}/print?job=${job.id}${job.client_pattern_version_id ? `&version=${job.client_pattern_version_id}` : ""}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                <Printer className="h-4 w-4" />
                Print A4 sheet
              </Link>
            </>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Fittings</h3>
        <ul className="space-y-2 text-sm">
          {job.fittings.map((fitting) => (
            <li key={fitting.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              #{fitting.fitting_number} · {fitting.status}
              {fitting.outcome ? ` · ${fitting.outcome}` : ""}
              {fitting.notes ? ` — ${fitting.notes}` : ""}
            </li>
          ))}
          {job.fittings.length === 0 ? <li className="text-slate-500">No fittings yet.</li> : null}
        </ul>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Fitting notes</span>
            <input
              value={fittingNotes}
              onChange={(e) => setFittingNotes(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <Button variant="secondary" onClick={() => void scheduleFitting()} disabled={acting}>
            Schedule fitting
          </Button>
        </div>
        {job.fittings.some((f) => f.status === "scheduled") ? (
          <div className="flex flex-wrap gap-3 items-end border-t border-slate-100 pt-4">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Complete fitting</span>
              <select
                value={selectedFittingId}
                onChange={(e) => setSelectedFittingId(e.target.value)}
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {job.fittings.filter((f) => f.status === "scheduled").map((f) => (
                  <option key={f.id} value={f.id}>#{f.fitting_number}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Outcome</span>
              <select
                value={fittingOutcome}
                onChange={(e) => setFittingOutcome(e.target.value as PatternFittingOutcome)}
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <Button onClick={() => void completeFitting()} disabled={acting}>
              Record outcome
            </Button>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h3 className="font-semibold text-slate-900">Revisions</h3>
        <div className="space-y-3">
          {job.revisions.map((revision) => (
            <div key={revision.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-900">v{revision.version}</p>
              <p className="text-sm text-slate-600">{revision.changes_summary ?? "—"}</p>
              <p className="mt-1 text-xs text-slate-500">{revision.revised_at}</p>
              {revision.pattern_files.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {revision.pattern_files.map((file) => (
                    <li key={file.id}>
                      <a
                        href={`/api/pattern/jobs/${jobId}/revisions/${revision.id}/files?file=${encodeURIComponent(file.stored_filename)}`}
                        className="text-indigo-700 hover:underline"
                      >
                        {file.filename} ({file.kind.toUpperCase()})
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              <label className="mt-2 block text-xs text-slate-600">
                Upload DXF/PDF
                <input
                  type="file"
                  accept=".pdf,.dxf,application/pdf"
                  className="mt-1 block text-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadFile(revision.id, file);
                  }}
                  disabled={acting}
                />
              </label>
            </div>
          ))}
          {job.revisions.length === 0 ? <p className="text-sm text-slate-500">No revisions yet.</p> : null}
        </div>
        <div className="flex flex-wrap gap-3 items-end border-t border-slate-100 pt-4">
          <label className="block text-sm flex-1 min-w-[200px]">
            <span className="font-medium text-slate-700">Changes summary</span>
            <input
              value={revisionSummary}
              onChange={(e) => setRevisionSummary(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <Button variant="secondary" onClick={() => void addRevision()} disabled={acting}>
            Add revision
          </Button>
        </div>
        {uploadRevisionId ? (
          <p className="text-xs text-slate-500">New uploads can be added on each revision card above.</p>
        ) : null}
      </section>
    </div>
  );
}
