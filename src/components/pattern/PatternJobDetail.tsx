"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { NestEstimatePanel } from "@/components/pattern/library/NestEstimatePanel";
import { PatternStageScanPanel } from "@/components/pattern/PatternStageScanPanel";
import type { GarmentTypeChangeFlag } from "@/lib/sales-orders/garment-type-change-flags";
import {
  generateTudPatternCode,
  listTudPiecePatternCodes,
} from "@/lib/pattern/tud-pattern-code";
import { filterTudFilesForPiece } from "@/lib/pattern-library/tud-versions";
import { isMultiPieceGarment, piecesForPatternJob } from "@/lib/sales-orders/label-codes";
import {
  defaultMeasurementTemplateMode,
  garmentOffersReducedMeasurementTemplate,
  type MeasurementTemplateMode,
} from "@/lib/pattern-library/measurement-template-mode";
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
  const router = useRouter();
  const [job, setJob] = useState<PatternJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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
  const [sheetPattern, setSheetPattern] = useState<ClientPattern | null>(null);
  const [sheetFiles, setSheetFiles] = useState<PatternLibraryAttachment[]>([]);
  const [linkPatternId, setLinkPatternId] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [measurementTemplateMode, setMeasurementTemplateMode] =
    useState<MeasurementTemplateMode>("reduced");
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
        setSheetPattern(null);
        return;
      }
      const data = await res.json();
      const pattern = data.pattern as ClientPattern | undefined;
      setSheetPattern(pattern ?? null);
      const allFiles = [
        ...(pattern?.files ?? []),
        ...(pattern?.versions.flatMap((version) => version.files) ?? []),
      ];
      setSheetFiles(allFiles);
    } catch {
      setSheetFiles([]);
      setSheetPattern(null);
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
      setMeasurementTemplateMode(defaultMeasurementTemplateMode(nextJob.garment_type));
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
        setSheetPattern(null);
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

  const jobSheetQuery = job
    ? [
        `job=${encodeURIComponent(job.id)}`,
        `line=${encodeURIComponent(job.sales_order_line_id)}`,
        job.client_pattern_version_id
          ? `version=${encodeURIComponent(job.client_pattern_version_id)}`
          : "",
      ]
        .filter(Boolean)
        .join("&")
    : "";

  const printHref = job?.client_pattern_id
    ? `/pattern/client-patterns/${job.client_pattern_id}/print?sheet=production&${jobSheetQuery}`
    : null;

  const printCutterHref = job?.client_pattern_id
    ? `/pattern/client-patterns/${job.client_pattern_id}/print?sheet=cutter&${jobSheetQuery}`
    : null;

  const photosPrintHref = job?.client_pattern_id
    ? `/pattern/client-patterns/${job.client_pattern_id}/photos/print`
    : null;

  const sheetHref = job?.client_pattern_id
    ? `/pattern/library/clients/${job.client_pattern_id}?job=${encodeURIComponent(job.id)}&line=${encodeURIComponent(job.sales_order_line_id)}`
    : null;

  const patternCode = job
    ? job.pattern_code?.trim() || generateTudPatternCode(job)
    : "";
  const pieceCodes = job ? listTudPiecePatternCodes(job) : [];
  const multiPiece = job ? isMultiPieceGarment(job.garment_type) : false;

  async function copyCode(code: string) {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 1600);
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
      const lineId = data.job?.sales_order_line_id ?? job?.sales_order_line_id ?? "";
      router.push(
        `/pattern/library/clients/${linkPatternId}?job=${encodeURIComponent(jobId)}${
          lineId ? `&line=${encodeURIComponent(lineId)}` : ""
        }`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link failed");
    } finally {
      setActing(false);
    }
  }

  /** Create a Sample/Trial/Final sheet for this job garment and open it for size entry. */
  async function createAndOpenSheet() {
    if (!job) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch("/api/pattern/library/client-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: job.client_id,
          client_code: job.client_code,
          client_name: job.client_name,
          garment_type: job.garment_type,
          fabric: job.fabric_number || null,
          linked_fabric_line_ids: [job.sales_order_line_id],
          measurement_template_mode: garmentOffersReducedMeasurementTemplate(
            job.garment_type
          )
            ? measurementTemplateMode
            : "entire",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to create sheet");
      const patternId = data?.pattern?.id as string | undefined;
      if (!patternId) throw new Error("Sheet created but id missing.");

      const linkRes = await fetch(`/api/pattern/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_pattern_id: patternId }),
      });
      const linkData = await linkRes.json().catch(() => null);
      if (!linkRes.ok) throw new Error(linkData?.error ?? "Failed to link sheet");

      router.push(
        `/pattern/library/clients/${patternId}?job=${encodeURIComponent(jobId)}&line=${encodeURIComponent(job.sales_order_line_id)}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sheet");
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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={`/pattern/orders/${job.sales_order_id}`}
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      {/* 1. Header - parent Suit line stays one job */}
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
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Create a Sample / Trial / Final sheet for{" "}
              <span className="font-medium text-slate-800">{job.garment_type}</span> and enter
              sizes.
            </p>
            {garmentOffersReducedMeasurementTemplate(job.garment_type) ? (
              <fieldset className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Measurement points
                </legend>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="measurement-template-mode"
                    className="mt-0.5"
                    checked={measurementTemplateMode === "reduced"}
                    onChange={() => setMeasurementTemplateMode("reduced")}
                  />
                  <span>
                    <span className="font-medium">Reduced</span>
                    <span className="block text-xs text-slate-500">
                      17 stitcher points (waist, hip, rise, thigh, knee, inseam, …)
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="measurement-template-mode"
                    className="mt-0.5"
                    checked={measurementTemplateMode === "entire"}
                    onChange={() => setMeasurementTemplateMode("entire")}
                  />
                  <span>
                    <span className="font-medium">Entire</span>
                    <span className="block text-xs text-slate-500">
                      Full trouser dictionary (all points, including unused)
                    </span>
                  </span>
                </label>
              </fieldset>
            ) : null}
            <button
              type="button"
              onClick={() => void createAndOpenSheet()}
              disabled={acting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {acting ? "Creating..." : "Create & open sheet"}
              <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-xs text-slate-500">
              Sharing one sheet across several fabrics?{" "}
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
                Use existing library template
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
                  Link & open
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

      {/* 4. .TUD - codes always visible; upload after sheet is linked */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <FileUp className="h-4 w-4 text-slate-400" />
            {multiPiece ? ".TUD files (per piece)" : ".TUD file"}
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {multiPiece
              ? "Copy each piece code as the Tuka filename, then upload that piece's .TUD. Shared sheet stays on this garment line."
              : `Name the file ${patternCode || "pattern code"}.tud`}
          </p>
        </div>

        {multiPiece ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
              Pattern codes for TUD names
            </p>
            {pieceCodes.map((piece) => (
              <div
                key={piece.piece_name}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-indigo-100"
              >
                <span className="text-sm font-medium text-slate-700">
                  {piece.piece_name}
                  <span className="ml-1.5 text-xs font-normal text-slate-500">
                    {piece.index}/{piece.total}
                  </span>
                </span>
                <code className="rounded-md bg-slate-50 px-2.5 py-1.5 font-mono text-sm font-semibold text-slate-900 ring-1 ring-slate-200">
                  {piece.code}
                </code>
                <button
                  type="button"
                  onClick={() => void copyCode(piece.code)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  {copiedCode === piece.code ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copiedCode === piece.code ? "Copied" : "Copy"}
                </button>
              </div>
            ))}
            <p className="text-xs text-slate-600">Paste each code as the .TUD filename in Tuka.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
              Pattern code for TUD name
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-white px-3 py-2 font-mono text-base font-semibold text-slate-900 ring-1 ring-indigo-100">
                {patternCode || "..."}
              </code>
              <button
                type="button"
                onClick={() => void copyCode(patternCode)}
                disabled={!patternCode}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {copiedCode === patternCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedCode === patternCode ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-600">Paste as the .TUD filename in Tuka.</p>
          </div>
        )}

        {job.client_pattern_id ? (
          multiPiece ? (
            <div className="space-y-3">
              {pieceCodes.map((piece) => {
                const pieceFiles = filterTudFilesForPiece(sheetFiles, piece.piece_name);
                return (
                  <div
                    key={piece.piece_name}
                    className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 space-y-2"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {piece.piece_name}
                      <span className="ml-2 text-xs font-medium text-slate-500">
                        {piece.index}/{piece.total}
                      </span>
                      <span className="ml-2 font-mono text-xs font-normal text-slate-500">
                        {piece.code}
                      </span>
                    </p>
                    <LibraryFileList
                      files={pieceFiles}
                      uploadUrl={`/api/pattern/library/client-patterns/${job.client_pattern_id}/files`}
                      downloadUrlBase={`/api/pattern/library/client-patterns/${job.client_pattern_id}/files`}
                      onUploaded={handleTudUploaded}
                      title="Upload / re-upload .TUD"
                      pieceName={piece.piece_name}
                      accept=".tud"
                      emptyLabel="No .TUD for this piece yet."
                      uploadLabel="Upload .TUD"
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <LibraryFileList
              files={filterTudFilesForPiece(sheetFiles, null)}
              uploadUrl={`/api/pattern/library/client-patterns/${job.client_pattern_id}/files`}
              downloadUrlBase={`/api/pattern/library/client-patterns/${job.client_pattern_id}/files`}
              onUploaded={handleTudUploaded}
              title="Upload / re-upload .TUD"
              accept=".tud"
              emptyLabel="No .TUD yet."
              uploadLabel="Upload .TUD"
            />
          )
        ) : (
          <p className="text-sm text-slate-500">
            Create or open a measurement sheet above, then upload the .TUD
            {multiPiece ? " for each piece" : ""}.
          </p>
        )}
      </section>

      {sheetPattern ? (
        <NestEstimatePanel
          pattern={sheetPattern}
          requiredPieceNames={piecesForPatternJob(job)}
          defaultFabricWidthCm={job.width_cm ?? null}
          onPatternUpdated={(next) => {
            setSheetPattern(next);
            const allFiles = [
              ...next.files,
              ...next.versions.flatMap((version) => version.files),
            ];
            setSheetFiles(allFiles);
          }}
        />
      ) : null}

      {/* 5. Print A4 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h3 className="flex items-center gap-2 font-semibold text-slate-900">
          <Printer className="h-4 w-4 text-slate-400" />
          Print A4 size sheet
        </h3>
        <p className="text-sm text-slate-500">
          Prints this job&apos;s fabric ({job.fabric_number}) only - even when the
          measurement sheet is shared with other fabrics.
        </p>
        {printHref ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={printHref}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              <Printer className="h-4 w-4" />
              Print A4 · {job.fabric_number}
            </Link>
            {printCutterHref ? (
              <Link
                href={printCutterHref}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" />
                Print cutter · {job.fabric_number}
              </Link>
            ) : null}
            {photosPrintHref ? (
              <Link
                href={photosPrintHref}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" />
                Print images
              </Link>
            ) : null}
          </div>
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
            Link a measurement sheet to see Sales uploads, send each photo to this fabric, and print
            images.
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
