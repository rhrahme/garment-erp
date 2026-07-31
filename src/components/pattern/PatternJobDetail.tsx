"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Copy, FileUp, Printer, Ruler } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/PageHeader";
import { ChangeGarmentTypeControl } from "@/components/orders/ChangeGarmentTypeControl";
import { GarmentPiecesNest } from "@/components/garment/GarmentPiecesNest";
import { GarmentTypeChangeBadge } from "@/components/garment-type/GarmentTypeChangeBadge";
import { ClientPhotoAssignmentPanel } from "@/components/pattern/library/ClientPhotoAssignmentPanel";
import {
  LibraryFileList,
  type LibraryUploadResponse,
} from "@/components/pattern/library/LibraryFileList";
import { PatternStageScanPanel } from "@/components/pattern/PatternStageScanPanel";
import type { GarmentTypeChangeFlag } from "@/lib/sales-orders/garment-type-change-flags";
import { piecesForPatternJob } from "@/lib/sales-orders/label-codes";
import type { PatternFittingOutcome, PatternJob, PatternJobStatus } from "@/lib/types/pattern";
import type { ClientPattern, PatternLibraryAttachment } from "@/lib/types/pattern-library";

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
  const [copied, setCopied] = useState(false);

  const [assignedTo, setAssignedTo] = useState("");
  const [sizeNotes, setSizeNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [blockedReason, setBlockedReason] = useState("");
  const [status, setStatus] = useState<PatternJobStatus>("pending");
  const [revisionSummary, setRevisionSummary] = useState("");
  const [fittingNotes, setFittingNotes] = useState("");
  const [fittingOutcome, setFittingOutcome] = useState<PatternFittingOutcome>("pass");
  const [selectedFittingId, setSelectedFittingId] = useState("");
  const [clientPatterns, setClientPatterns] = useState<ClientPattern[]>([]);
  const [sheetFiles, setSheetFiles] = useState<PatternLibraryAttachment[]>([]);
  const [linkPatternId, setLinkPatternId] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [canChangeGarmentType, setCanChangeGarmentType] = useState(false);
  const [garmentTypeChangeFlag, setGarmentTypeChangeFlag] = useState<GarmentTypeChangeFlag | null>(
    null
  );

  const loadSheetFiles = useCallback(async (patternId: string) => {
    try {
      const res = await fetch(`/api/pattern/library/client-patterns/${patternId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setSheetFiles([]);
        return;
      }
      const data = await res.json();
      const pattern = data.pattern as ClientPattern | undefined;
      setSheetFiles(pattern?.files ?? []);
    } catch {
      setSheetFiles([]);
    }
  }, []);

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
      setSizeNotes(nextJob.pattern_size_notes ?? "");
      setNotes(nextJob.notes ?? "");
      setBlockedReason(nextJob.blocked_reason ?? "");
      setStatus(nextJob.status);
      const scheduled = nextJob.fittings.find((f) => f.status === "scheduled");
      setSelectedFittingId(scheduled?.id ?? nextJob.fittings[nextJob.fittings.length - 1]?.id ?? "");
      if (nextJob.client_pattern_id) {
        await loadSheetFiles(nextJob.client_pattern_id);
      } else {
        setSheetFiles([]);
      }
      const flagsRes = await fetch(
        `/api/garment-type-changes?sales_order_id=${nextJob.sales_order_id}`,
        { cache: "no-store" }
      );
      if (flagsRes.ok) {
        const flagsData = (await flagsRes.json()) as {
          flags?: Record<string, GarmentTypeChangeFlag>;
        };
        setGarmentTypeChangeFlag(flagsData.flags?.[nextJob.sales_order_line_id] ?? null);
      } else {
        setGarmentTypeChangeFlag(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [jobId, loadSheetFiles]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch("/api/pattern/library/client-patterns", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setClientPatterns(data?.client_patterns ?? []))
      .catch(() => setClientPatterns([]));
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCanChangeGarmentType(Boolean(data?.can_change_garment_type)))
      .catch(() => setCanChangeGarmentType(false));
  }, []);

  const linkedPattern = useMemo(() => {
    if (!job?.client_pattern_id) return null;
    return clientPatterns.find((pattern) => pattern.id === job.client_pattern_id) ?? null;
  }, [clientPatterns, job?.client_pattern_id]);

  const templateOptions = useMemo(() => {
    if (!job) return [];
    return clientPatterns.filter(
      (pattern) =>
        pattern.client_id === job.client_id && pattern.garment_type === job.garment_type
    );
  }, [clientPatterns, job]);

  const printHref = job?.client_pattern_id
    ? `/pattern/client-patterns/${job.client_pattern_id}/print?job=${job.id}${
        job.client_pattern_version_id ? `&version=${job.client_pattern_version_id}` : ""
      }`
    : null;

  const sheetHref = job?.client_pattern_id
    ? `/pattern/library/clients/${job.client_pattern_id}`
    : null;

  const patternCode = job?.pattern_code?.trim() || "";

  async function copyPatternCode() {
    if (!patternCode) return;
    try {
      await navigator.clipboard.writeText(patternCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Could not copy pattern code.");
    }
  }

  async function saveAdvanced() {
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          assigned_to: assignedTo || null,
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

  async function linkTemplate() {
    if (!linkPatternId) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_pattern_id: linkPatternId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Link failed");
      setJob(data.job);
      setShowTemplatePicker(false);
      setLinkPatternId("");
      await loadSheetFiles(linkPatternId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link failed");
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

  async function uploadLegacyFile(revisionId: string, file: File) {
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

  function handleTudUploaded(_response?: LibraryUploadResponse) {
    if (job?.client_pattern_id) void loadSheetFiles(job.client_pattern_id);
  }

  if (loading) return <p className="text-sm text-slate-500">Loading job...</p>;
  if (!job) return <p className="text-sm text-slate-500">Job not found.</p>;

  const tudFiles = sheetFiles.filter((file) => file.kind === "tud");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={`/pattern/orders/${job.sales_order_id}`}
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      {/* 1. Header */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            {job.client_name}
          </h2>
          <StatusBadge status={job.status} />
          {garmentTypeChangeFlag ? <GarmentTypeChangeBadge flag={garmentTypeChangeFlag} /> : null}
        </div>
        <p className="mt-1 text-base font-medium text-slate-800">
          {job.so_number} - L{String(job.article_number).padStart(2, "0")} - {job.garment_type}
        </p>
        <GarmentPiecesNest garmentType={job.garment_type} pieces={piecesForPatternJob(job)} />
        <p className="mt-2 text-sm text-slate-600">
          {job.fabric_number} - {job.supplier} - {job.meters}m
          {job.color ? ` - ${job.color}` : ""}
        </p>
      </section>

      {/* 2. Pattern code for TUD name */}
      <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
          Pattern code for TUD name
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-white px-3 py-2 font-mono text-base font-semibold text-slate-900 ring-1 ring-indigo-100">
            {patternCode || "..."}
          </code>
          <button
            type="button"
            onClick={() => void copyPatternCode()}
            disabled={!patternCode}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-600">Paste as the .TUD filename in Tuka.</p>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {/* 3. Garment type + measurement sheet */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <Ruler className="h-4 w-4 text-slate-400" />
            Measurement sheet
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">Sample / Trial / Final</p>
        </div>
        {canChangeGarmentType ? (
          <ChangeGarmentTypeControl
            salesOrderId={job.sales_order_id}
            lineId={job.sales_order_line_id}
            currentGarmentType={job.garment_type}
            onChanged={() => void load()}
          />
        ) : (
          <p className="text-sm text-slate-700">
            Garment: <span className="font-medium">{job.garment_type}</span>
          </p>
        )}
        {sheetHref && printHref ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={sheetHref}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Open sheet
              <ArrowRight className="h-4 w-4" />
            </Link>
            {linkedPattern ? (
              <span className="self-center text-xs text-slate-500">{linkedPattern.pattern_ref}</span>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              No sheet yet.{" "}
              <Link
                href={`/pattern/orders/${job.sales_order_id}`}
                className="font-medium text-indigo-700 hover:text-indigo-900"
              >
                Consolidate on the order board
              </Link>
              .
            </p>
            {!showTemplatePicker ? (
              <button
                type="button"
                onClick={() => setShowTemplatePicker(true)}
                className="text-sm text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
              >
                Use library template
              </button>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <label className="block min-w-[12rem] flex-1 text-sm">
                  <span className="text-xs font-medium text-slate-600">Template</span>
                  <select
                    value={linkPatternId}
                    onChange={(e) => setLinkPatternId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select...</option>
                    {templateOptions.map((pattern) => (
                      <option key={pattern.id} value={pattern.id}>
                        {pattern.pattern_ref}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  size="sm"
                  onClick={() => void linkTemplate()}
                  disabled={acting || !linkPatternId}
                >
                  Link
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTemplatePicker(false);
                    setLinkPatternId("");
                  }}
                  className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 4. .TUD upload */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <FileUp className="h-4 w-4 text-slate-400" />
            .TUD file
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Name the file <span className="font-mono text-slate-700">{patternCode || "pattern code"}</span>
            .tud
          </p>
        </div>
        {job.client_pattern_id ? (
          <div className="space-y-2">
            <LibraryFileList
              files={tudFiles.length > 0 ? tudFiles : sheetFiles}
              uploadUrl={`/api/pattern/library/client-patterns/${job.client_pattern_id}/files`}
              downloadUrlBase={`/api/pattern/library/client-patterns/${job.client_pattern_id}/files`}
              onUploaded={handleTudUploaded}
              title="Upload / re-upload .TUD"
            />
          </div>
        ) : (
          <p className="text-sm text-slate-500">Link a measurement sheet first, then upload the .TUD.</p>
        )}
      </section>

      {/* 5. Print A4 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h3 className="flex items-center gap-2 font-semibold text-slate-900">
          <Printer className="h-4 w-4 text-slate-400" />
          Print A4 size sheet
        </h3>
        <p className="text-sm text-slate-500">
          Print sheet is one A4 page per piece, each with that piece&apos;s manufacturing QR (e.g. Suit = Jacket + Trouser pages).
        </p>
        {printHref ? (
          <Link
            href={printHref}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" />
            Print A4
          </Link>
        ) : (
          <p className="text-sm text-slate-500">Link a sheet to print.</p>
        )}
      </section>

      {/* 6. Pattern scan */}
      <PatternStageScanPanel onRefresh={() => void load()} />

      {/* 7. Photos */}
      {job.client_pattern_id ? (
        <ClientPhotoAssignmentPanel
          clientId={job.client_id}
          patternId={job.client_pattern_id}
          linkedLineIds={[job.sales_order_line_id]}
        />
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-slate-900">Client photos</h3>
          <p className="mt-1 text-sm text-slate-500">
            Link a measurement sheet to assign photos to this fabric.
          </p>
        </section>
      )}

      {/* Rare fields */}
      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
          More
        </summary>
        <div className="space-y-6 border-t border-slate-100 px-5 py-4">
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Status advances from Pattern scan. Override only if needed.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Status override</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PatternJobStatus)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
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
            <Button onClick={() => void saveAdvanced()} disabled={acting}>
              {acting ? "Saving..." : "Save"}
            </Button>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <h4 className="text-sm font-semibold text-slate-900">Fittings</h4>
            <ul className="space-y-2 text-sm">
              {job.fittings.map((fitting) => (
                <li
                  key={fitting.id}
                  className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  #{fitting.fitting_number} - {fitting.status}
                  {fitting.outcome ? ` - ${fitting.outcome}` : ""}
                  {fitting.notes ? ` - ${fitting.notes}` : ""}
                </li>
              ))}
              {job.fittings.length === 0 ? (
                <li className="text-slate-500">No fittings yet.</li>
              ) : null}
            </ul>
            <div className="flex flex-wrap items-end gap-3">
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
              <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Complete fitting</span>
                  <select
                    value={selectedFittingId}
                    onChange={(e) => setSelectedFittingId(e.target.value)}
                    className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {job.fittings
                      .filter((f) => f.status === "scheduled")
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          #{f.fitting_number}
                        </option>
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
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <Button onClick={() => void completeFitting()} disabled={acting}>
                  Record outcome
                </Button>
              </div>
            ) : null}
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <h4 className="text-sm font-semibold text-slate-900">Legacy revisions (DXF / PDF)</h4>
            <div className="space-y-3">
              {job.revisions.map((revision) => (
                <div key={revision.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-900">v{revision.version}</p>
                  <p className="text-sm text-slate-600">{revision.changes_summary ?? "-"}</p>
                  {revision.pattern_files.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {revision.pattern_files.map((file) => (
                        <li key={file.id}>
                          <a
                            href={`/api/pattern/jobs/${jobId}/revisions/${revision.id}/files?file=${encodeURIComponent(file.stored_filename)}`}
                            className="text-indigo-700 hover:underline"
                          >
                            {file.filename}
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
                        if (file) void uploadLegacyFile(revision.id, file);
                      }}
                      disabled={acting}
                    />
                  </label>
                </div>
              ))}
              {job.revisions.length === 0 ? (
                <p className="text-sm text-slate-500">No legacy revisions.</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block min-w-[200px] flex-1 text-sm">
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
          </div>
        </div>
      </details>
    </div>
  );
}
