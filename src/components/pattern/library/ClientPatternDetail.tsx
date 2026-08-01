"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  History,
  Layers,
  Minus,
  MoveDown,
  MoveUp,
  Plus,
  Printer,
  Ruler,
  Trash2,
  X,
} from "lucide-react";
import { BasePatternCascadePicker } from "@/components/pattern/library/BasePatternCascadePicker";
import { ClientPhotoAssignmentPanel } from "@/components/pattern/library/ClientPhotoAssignmentPanel";
import { MeasurementInput } from "@/components/pattern/library/MeasurementInput";
import {
  LibraryFileList,
  type LibraryUploadResponse,
} from "@/components/pattern/library/LibraryFileList";
import { LinkedFabricsCard } from "@/components/pattern/library/LinkedFabricsCard";
import { NestEstimatePanel } from "@/components/pattern/library/NestEstimatePanel";
import { PatternQrBadge } from "@/components/pattern/library/PatternQrBadge";
import { TudVersionHistory } from "@/components/pattern/library/TudVersionHistory";
import {
  DXF_UPLOAD_ACCEPT,
  findActiveMarkerAttachment,
  listDxfFiles,
  listMarkerFiles,
  MARKER_UPLOAD_ACCEPT,
} from "@/lib/pattern-library/cutting-completeness";
import { getGarmentPieces } from "@/lib/sales-orders/label-codes";
import {
  emptyCascadeValue,
  garmentLabel,
  PATTERN_SHEET_GARMENTS,
  preferredBrandCodeFromClientCode,
  type BasePatternCascadeValue,
} from "@/lib/pattern-library/base-pattern-picker";
import { formatMeasurement, unitLabel } from "@/lib/pattern-library/measurements";
import { clientPatternQrUrl } from "@/lib/pattern-library/pattern-qr";
import { TudViewerModal } from "@/components/pattern/library/TudViewerModal";
import { formatTudSizeDerivedLine } from "@/lib/pattern-library/derived-from";
import {
  buildTrialSheetColumns,
  currentTrialVersion,
  sampleValueForPoint,
  trialColumnValue,
  trialSheetPoints,
  trialSheetStatusLabel,
} from "@/lib/pattern-library/trial-sheet";
import { clientPatternTudPreview, formatAreaM2 } from "@/lib/pattern-library/tud-display";
import { sizesMatch, type TudFillSuggestion } from "@/lib/pattern-library/tud-size-fill";
import type {
  BasePattern,
  ClientPattern,
  ClientPatternMeasurement,
  ClientPatternVersion,
} from "@/lib/types/pattern-library";
import { cn } from "@/lib/utils";

interface LinkedJob {
  id: string;
  so_number: string;
  garment_type: string;
  status: string;
  client_pattern_version_id: string | null;
  width_cm?: number | null;
}

interface LinkedBaseSummary {
  id: string;
  name: string;
  display_name: string | null;
}

type ViewTab = "measurements" | "evolution" | "history";

function versionLabel(version: ClientPatternVersion): string {
  return `Trial ${version.version}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

export function ClientPatternDetail({ patternId }: { patternId: string }) {
  const [pattern, setPattern] = useState<ClientPattern | null>(null);
  const [linkedJobs, setLinkedJobs] = useState<LinkedJob[]>([]);
  const [suggestedFabricWidthCm, setSuggestedFabricWidthCm] = useState<number | null>(null);
  const [suggestedFabricWidthSource, setSuggestedFabricWidthSource] = useState<
    "saved" | "hint" | "fabric_ref" | "sales_order_line" | null
  >(null);
  const [linkedBase, setLinkedBase] = useState<LinkedBaseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewTab>("measurements");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [headerDirty, setHeaderDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPointName, setNewPointName] = useState("");
  const [tudViewerOpen, setTudViewerOpen] = useState(false);
  // Post-upload .tud prompt: pick a detected size (and base, if none linked),
  // confirm, and the sheet's empty cells are filled from the base values.
  const [tudFill, setTudFill] = useState<TudFillSuggestion | null>(null);
  const [tudFillSize, setTudFillSize] = useState("");
  const [tudFillBaseId, setTudFillBaseId] = useState("");
  const [tudFillBusy, setTudFillBusy] = useState(false);
  const [tudFillNotice, setTudFillNotice] = useState<string | null>(null);
  const [libraryBases, setLibraryBases] = useState<BasePattern[]>([]);
  const [tudCascade, setTudCascade] = useState<BasePatternCascadeValue>(() => emptyCascadeValue());
  const [sheetMode, setSheetMode] = useState<"trials" | "detail">("trials");
  /** Piece name -> sibling pattern id when CAD is borrowed for multi-piece shells. */
  const [geometryBorrowedFrom, setGeometryBorrowedFrom] = useState<Record<string, string>>(
    {}
  );

  const load = useCallback(
    async (keepSelection = false) => {
      try {
        const res = await fetch(
          `/api/pattern/library/client-patterns/${patternId}?t=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        const loaded: ClientPattern = data.pattern;
        setPattern(loaded);
        setGeometryBorrowedFrom(
          data.geometry_borrowed_from && typeof data.geometry_borrowed_from === "object"
            ? data.geometry_borrowed_from
            : {}
        );
        setLinkedJobs(data.linked_jobs ?? []);
        setSuggestedFabricWidthCm(
          typeof data.suggested_fabric_width_cm === "number" &&
            data.suggested_fabric_width_cm > 0
            ? data.suggested_fabric_width_cm
            : null
        );
        setSuggestedFabricWidthSource(data.suggested_fabric_width_source ?? null);
        setLinkedBase(
          data.base
            ? {
                id: data.base.id,
                name: data.base.name,
                display_name: data.base.display_name ?? null,
              }
            : null
        );
        setDirty(false);
        setHeaderDirty(false);
        setSelectedVersionId((current) => {
          if (keepSelection && current && loaded.versions.some((v) => v.id === current)) {
            return current;
          }
          return (
            loaded.final_version_id ?? loaded.versions[loaded.versions.length - 1]?.id ?? null
          );
        });
      } catch {
        setPattern(null);
        setLinkedBase(null);
        setGeometryBorrowedFrom({});
      } finally {
        setLoading(false);
      }
    },
    [patternId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const version = useMemo(
    () => pattern?.versions.find((candidate) => candidate.id === selectedVersionId) ?? null,
    [pattern, selectedVersionId]
  );

  function mutatePattern(updater: (draft: ClientPattern) => ClientPattern, header = false) {
    setPattern((current) => (current ? updater(current) : current));
    if (header) setHeaderDirty(true);
    else setDirty(true);
  }

  function mutateVersion(updater: (draft: ClientPatternVersion) => ClientPatternVersion) {
    if (!selectedVersionId) return;
    mutatePattern((draft) => ({
      ...draft,
      versions: draft.versions.map((candidate) =>
        candidate.id === selectedVersionId ? updater(candidate) : candidate
      ),
    }));
  }

  function setMeasurement(pointId: string, patch: Partial<ClientPatternMeasurement>) {
    mutateVersion((draft) => ({
      ...draft,
      measurements: draft.measurements.map((row) =>
        row.point_id === pointId ? { ...row, ...patch } : row
      ),
    }));
  }

  function addMeasurementRow() {
    const name = newPointName.trim();
    if (!name || !version) return;
    const pointId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (version.measurements.some((row) => row.point_id === pointId)) return;
    mutateVersion((draft) => ({
      ...draft,
      measurements: [
        ...draft.measurements,
        {
          point_id: pointId,
          name,
          remark: null,
          is_graded: true,
          base_value: null,
          target_value: null,
          sewn_value: null,
          adjustment: null,
          remarks: null,
        },
      ],
    }));
    setNewPointName("");
  }

  async function saveHeader(extra: { rebuild_template?: boolean } = {}) {
    if (!pattern) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/library/client-patterns/${patternId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern_ref: pattern.pattern_ref,
          description: pattern.description,
          fabric: pattern.fabric,
          garment_type: pattern.garment_type,
          special_instructions: pattern.special_instructions,
          physical_pattern_kept: pattern.physical_pattern_kept,
          physical_pattern_location: pattern.physical_pattern_location,
          notes: pattern.notes,
          rebuild_template: extra.rebuild_template === true,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save.");
      }
      const data = await res.json().catch(() => null);
      if (data?.pattern) setPattern(data.pattern);
      setHeaderDirty(false);
      if (extra.rebuild_template) setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function activateTudVersion(fileId: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/library/client-patterns/${patternId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active_tud_file_id: fileId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to set active .TUD.");
      }
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set active .TUD.");
    } finally {
      setSaving(false);
    }
  }

  async function activateMarkerFile(fileId: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/library/client-patterns/${patternId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active_marker_file_id: fileId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to set active marker.");
      }
      const data = await res.json().catch(() => null);
      if (data?.pattern) setPattern(data.pattern);
      else await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set active marker.");
    } finally {
      setSaving(false);
    }
  }

  /** Persist Sample / Trial / Final cell edits across versions in one save. */
  async function saveTrialSheet() {
    if (!pattern) return;
    setSaving(true);
    setError(null);
    try {
      for (const trial of pattern.versions) {
        const res = await fetch(
          `/api/pattern/library/client-patterns/${patternId}/versions/${trial.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              measurements: trial.measurements,
              trial_date: trial.trial_date,
              special_instructions: trial.special_instructions,
              notes: trial.notes,
            }),
          }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Failed to save Trial ${trial.version}.`);
        }
      }
      setDirty(false);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save sheet.");
    } finally {
      setSaving(false);
    }
  }

  function setSampleValue(pointId: string, value: number | null) {
    mutatePattern((draft) => ({
      ...draft,
      versions: draft.versions.map((trial) => ({
        ...trial,
        measurements: trial.measurements.map((row) =>
          row.point_id === pointId ? { ...row, base_value: value } : row
        ),
      })),
    }));
  }

  function setTrialTarget(versionId: string, pointId: string, value: number | null) {
    mutatePattern((draft) => ({
      ...draft,
      versions: draft.versions.map((trial) =>
        trial.id !== versionId
          ? trial
          : {
              ...trial,
              measurements: trial.measurements.map((row) =>
                row.point_id === pointId ? { ...row, target_value: value } : row
              ),
            }
      ),
    }));
  }

  async function changeGarmentType(nextGarment: string) {
    if (!pattern || !nextGarment || nextGarment === pattern.garment_type) return;
    const rebuild =
      !pattern.base_pattern_id &&
      window.confirm(
        `Switch garment type to ${garmentLabel(nextGarment)} and refresh the measurement template points? Entered values on matching points are kept.`
      );
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/library/client-patterns/${patternId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garment_type: nextGarment,
          rebuild_template: rebuild,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to update garment type.");
      }
      const data = await res.json();
      setPattern(data.pattern);
      setHeaderDirty(false);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update garment type.");
    } finally {
      setSaving(false);
    }
  }

  /** Seed Sample/Trial/Final rows from the garment dictionary when the grid is empty. */
  async function loadTemplatePoints() {
    if (!pattern || pattern.base_pattern_id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/library/client-patterns/${patternId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garment_type: pattern.garment_type,
          rebuild_template: true,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to load template points.");
      }
      const data = await res.json();
      setPattern(data.pattern);
      setHeaderDirty(false);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load template points.");
    } finally {
      setSaving(false);
    }
  }

  async function saveVersion() {
    if (!pattern || !version) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/pattern/library/client-patterns/${patternId}/versions/${version.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            measurements: version.measurements,
            trial_date: version.trial_date,
            special_instructions: version.special_instructions,
            notes: version.notes,
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save.");
      }
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function addTrial() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/library/client-patterns/${patternId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to add trial.");
      }
      const data = await res.json();
      setPattern(data.pattern);
      setSelectedVersionId(data.version.id);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add trial.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleFinal(target: ClientPatternVersion) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/pattern/library/client-patterns/${patternId}/versions/${target.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: target.is_final ? "unfinalize" : "finalize" }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to update final version.");
      }
      const data = await res.json();
      setPattern(data.pattern);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update final version.");
    } finally {
      setSaving(false);
    }
  }

  function handleUploaded(response?: LibraryUploadResponse) {
    void load(true);
    const suggestion = response?.tud_fill ?? null;
    if (!suggestion) return;
    const firstBase = suggestion.base ?? suggestion.candidate_bases[0] ?? null;
    // Prefer the trial on screen - pattern-level uploads otherwise default the
    // suggestion to the latest trial, which may not be the open sheet.
    setTudFill({
      ...suggestion,
      version_id: selectedVersionId ?? suggestion.version_id,
    });
    setTudFillBaseId(firstBase?.id ?? "");
    setTudFillSize(firstBase?.matches[0]?.size ?? "");
    setTudFillNotice(null);
    if (!suggestion.base && pattern) {
      const brand = preferredBrandCodeFromClientCode(pattern.client_code);
      setTudCascade({
        ...emptyCascadeValue(brand),
        garmentType: pattern.garment_type,
        origin: "library",
        houseBrandCode: brand ?? firstBase?.house_brand_code ?? "",
        basePatternId: firstBase?.id ?? "",
        baseSize: firstBase?.matches[0]?.base_size ?? "",
      });
      void fetch("/api/pattern/library", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setLibraryBases(data?.base_patterns ?? []))
        .catch(() => setLibraryBases([]));
    }
  }

  function handleTudCascadeChange(next: BasePatternCascadeValue) {
    setTudCascade(next);
    setTudFillBaseId(next.basePatternId);
    if (!tudFill || !next.basePatternId) return;
    const candidate =
      tudFill.candidate_bases.find((entry) => entry.id === next.basePatternId) ?? null;
    if (candidate) {
      const match =
        candidate.matches.find((entry) => sizesMatch(entry.base_size, next.baseSize)) ??
        candidate.matches[0] ??
        null;
      setTudFillSize(match?.size ?? next.baseSize);
      return;
    }
    setTudFillSize(next.baseSize);
  }

  async function applyTudFill() {
    if (!tudFill || !tudFillSize) return;
    if (dirty) {
      const proceed = window.confirm(
        "You have unsaved measurement edits. Applying the .tud fill will reload the sheet and discard them. Continue?"
      );
      if (!proceed) return;
    }
    setTudFillBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pattern/library/client-patterns/${patternId}/tud-fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          size: tudFillSize,
          // Only sent when the pattern has no base yet (links it).
          base_pattern_id: tudFill.base ? undefined : tudFillBaseId || undefined,
          // Fill the trial on screen when the upload didn't pin a version.
          version_id: selectedVersionId ?? tudFill.version_id ?? undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to fill the sheet.");
      const filled = body?.filled_points ?? 0;
      const added = body?.added_points ?? 0;
      const parts = [`Size set to ${body?.base_size ?? tudFillSize}`];
      if (filled > 0) parts.push(`${filled} point${filled === 1 ? "" : "s"} filled`);
      if (added > 0) parts.push(`${added} added`);
      setTudFillNotice(`${parts.join(" / ")} - from the base pattern values. Entered cells were left unchanged.`);
      setTudFill(null);
      if (typeof body?.version_id === "string") setSelectedVersionId(body.version_id);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fill the sheet.");
    } finally {
      setTudFillBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading client pattern...</p>;
  if (!pattern) return <p className="text-sm text-rose-600">Client pattern not found.</p>;

  const unit = pattern.unit;
  const sheetQs = version ? `version=${encodeURIComponent(version.id)}` : "";
  const printCutterHref = `/pattern/client-patterns/${pattern.id}/print?sheet=cutter${sheetQs ? `&${sheetQs}` : ""}`;
  const printProductionHref = `/pattern/client-patterns/${pattern.id}/print?sheet=production${sheetQs ? `&${sheetQs}` : ""}`;
  const photosPrintHref = `/pattern/client-patterns/${pattern.id}/photos/print`;
  const pdfCutterHref = `/api/pattern/library/client-patterns/${pattern.id}/pdf?sheet=cutter${sheetQs ? `&${sheetQs}` : ""}`;
  const pdfProductionHref = `/api/pattern/library/client-patterns/${pattern.id}/pdf?sheet=production${sheetQs ? `&${sheetQs}` : ""}`;
  const tudPreview = clientPatternTudPreview(pattern);
  const basePatternName = linkedBase?.display_name ?? null;
  const tudSizes = tudPreview?.attachment.tud?.sizes ?? (pattern.base_size ? [pattern.base_size] : []);
  const tudFillCandidate = tudFill
    ? tudFill.base ?? tudFill.candidate_bases.find((c) => c.id === tudFillBaseId) ?? null
    : null;
  const tudFillMatch = tudFillCandidate?.matches.find((m) => m.size === tudFillSize) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/pattern/library"
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:text-indigo-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Pattern library
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/pattern/library/fabrics/${pattern.client_id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-indigo-700 ring-1 ring-slate-200 hover:bg-indigo-50"
          >
            <Layers className="h-4 w-4" />
            Client fabrics
          </Link>
          <Link
            href={printCutterHref}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print cutter
          </Link>
          <Link
            href={printProductionHref}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print production
          </Link>
          <Link
            href={photosPrintHref}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print images
          </Link>
          <a
            href={pdfCutterHref}
            download
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Download cutter sheet
          </a>
          <a
            href={pdfProductionHref}
            download
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Download production sheet
          </a>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm sm:col-span-2 lg:col-span-1">
            <span className="mb-1 block text-xs font-medium text-slate-600">Pattern ref</span>
            <input
              value={pattern.pattern_ref}
              onChange={(e) =>
                mutatePattern((draft) => ({ ...draft, pattern_ref: e.target.value.toUpperCase() }), true)
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm font-semibold"
            />
          </label>
          <div className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Client</span>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
              {pattern.client_name} <span className="text-slate-400">({pattern.client_code})</span>
            </p>
          </div>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Garment type</span>
            <select
              value={
                PATTERN_SHEET_GARMENTS.includes(pattern.garment_type)
                  ? pattern.garment_type
                  : pattern.garment_type
              }
              onChange={(e) => void changeGarmentType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
            >
              {!PATTERN_SHEET_GARMENTS.includes(pattern.garment_type) ? (
                <option value={pattern.garment_type}>
                  {garmentLabel(pattern.garment_type)}
                </option>
              ) : null}
              {PATTERN_SHEET_GARMENTS.map((garment) => (
                <option key={garment} value={garment}>
                  {garmentLabel(garment)}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-slate-400">
              Drives the measurement template (library bases stay separate).
            </span>
          </label>
          <div className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Origin</span>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
              {linkedBase && pattern.base_pattern_id ? (
                <>
                  <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Library base
                  </span>
                  <Link
                    href={`/pattern/library/bases/${pattern.base_pattern_id}`}
                    className="font-medium text-indigo-700 hover:underline"
                  >
                    {basePatternName ?? linkedBase.name}
                  </Link>
                  {pattern.base_size ? (
                    <span className="mt-0.5 block text-xs text-slate-500">Size {pattern.base_size}</span>
                  ) : null}
                </>
              ) : (
                <>
                  <span className="font-medium text-slate-800">Custom template</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Sheet points from garment type dictionary
                  </span>
                </>
              )}
            </p>
          </div>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Description</span>
            <input
              value={pattern.description ?? ""}
              onChange={(e) =>
                mutatePattern((draft) => ({ ...draft, description: e.target.value || null }), true)
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Fabric</span>
            <input
              value={pattern.fabric ?? ""}
              onChange={(e) =>
                mutatePattern((draft) => ({ ...draft, fabric: e.target.value || null }), true)
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Special instructions
            </span>
            <input
              value={pattern.special_instructions ?? ""}
              onChange={(e) =>
                mutatePattern(
                  (draft) => ({ ...draft, special_instructions: e.target.value || null }),
                  true
                )
              }
              placeholder="e.g. 2 pleat at slv"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
            </div>
          </div>
          {/* Extracted TUKA preview from the latest .tud upload - click to open the viewer */}
          {tudPreview ? (
            <div className="flex shrink-0 flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => setTudViewerOpen(true)}
                className="rounded-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                title={tudPreview.attachment.tud?.style_caption ?? tudPreview.attachment.filename}
                aria-label="Open TUKA preview"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tudPreview.thumbnailUrl}
                  alt={tudPreview.attachment.tud?.style_caption ?? "TUKA pattern preview"}
                  width={100}
                  height={100}
                  className="h-28 w-28 rounded-lg border border-slate-200 bg-white object-contain p-1.5 shadow-sm"
                />
              </button>
              <p className="max-w-28 truncate text-center text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {tudPreview.attachment.tud?.total_area_m2 != null
                  ? `TUKA / ${formatAreaM2(tudPreview.attachment.tud.total_area_m2)}`
                  : "TUKA preview"}
              </p>
              <p
                className="max-w-[9.5rem] text-center text-[11px] font-medium leading-snug text-slate-600"
                title={formatTudSizeDerivedLine(tudSizes, basePatternName)}
              >
                {formatTudSizeDerivedLine(tudSizes, basePatternName)}
              </p>
              {tudViewerOpen ? (
                <TudViewerModal
                  attachment={tudPreview.attachment}
                  thumbnailUrl={tudPreview.thumbnailUrl}
                  downloadUrl={tudPreview.downloadUrl}
                  onClose={() => setTudViewerOpen(false)}
                  basePatternName={basePatternName}
                />
              ) : null}
            </div>
          ) : null}
          {/* Fixed pattern QR - permanent deep link, survives ref edits */}
          <PatternQrBadge payload={clientPatternQrUrl(pattern.id)} label={pattern.pattern_ref} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={pattern.physical_pattern_kept}
                onChange={(e) =>
                  mutatePattern(
                    (draft) => ({ ...draft, physical_pattern_kept: e.target.checked }),
                    true
                  )
                }
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-slate-700">Physical pattern kept</span>
            </label>
            {pattern.physical_pattern_kept ? (
              <input
                value={pattern.physical_pattern_location ?? ""}
                onChange={(e) =>
                  mutatePattern(
                    (draft) => ({ ...draft, physical_pattern_location: e.target.value || null }),
                    true
                  )
                }
                placeholder="Location note"
                className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void saveHeader()}
            disabled={!headerDirty || saving}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium",
              headerDirty ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-100 text-slate-400"
            )}
          >
            {headerDirty ? "Save details" : "Details saved"}
          </button>
        </div>
      </div>

      {/* .tud size detected - confirm before setting the size / filling the sheet */}
      {tudFill ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <Ruler className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-semibold text-slate-800">
                  Size{tudFill.sizes.length === 1 ? "" : "s"} detected in{" "}
                  {tudFill.style_caption ?? tudFill.filename}: {tudFill.sizes.join(", ")}
                </p>
                {!tudFill.base ? (
                  <div className="max-w-2xl rounded-lg border border-indigo-100 bg-white/80 p-3">
                    <p className="mb-2 text-xs font-medium text-slate-600">
                      This pattern has no base yet - pick a library base (filtered by brand &amp;
                      garment)
                    </p>
                    <BasePatternCascadePicker
                      bases={libraryBases}
                      extraGarments={[pattern.garment_type]}
                      value={tudCascade}
                      onChange={handleTudCascadeChange}
                      forceLibrary
                    />
                  </div>
                ) : null}
                {tudFillCandidate && tudFillCandidate.matches.length > 1 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-600">Use size</span>
                    {tudFillCandidate.matches.map((match) => (
                      <button
                        key={match.size}
                        type="button"
                        onClick={() => setTudFillSize(match.size)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-sm font-medium",
                          match.size === tudFillSize
                            ? "bg-indigo-600 text-white"
                            : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                        )}
                      >
                        {match.size}
                      </button>
                    ))}
                  </div>
                ) : null}
                {tudFillCandidate && tudFillMatch ? (
                  <p className="text-sm text-slate-700">
                    Set size to <span className="font-semibold">{tudFillMatch.base_size}</span> and
                    fill the sheet with {tudFillCandidate.name} / {tudFillMatch.base_size} base
                    values? Only empty cells are filled - entered values are kept.
                    {tudFill.base &&
                    tudFillCandidate.matches.length === 1 &&
                    (tudFill.fillable_points !== null || tudFill.addable_points !== null) ? (
                      <span className="mt-1 block text-xs text-slate-500">
                        Preview
                        {tudFill.fillable_points
                          ? `: ${tudFill.fillable_points} empty point${tudFill.fillable_points === 1 ? "" : "s"} to fill`
                          : ": no empty cells to fill"}
                        {tudFill.addable_points
                          ? ` / ${tudFill.addable_points} base point${tudFill.addable_points === 1 ? "" : "s"} to add`
                          : ""}
                        .
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTudFill(null)}
              className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-600"
              aria-label="Dismiss size suggestion"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void applyTudFill()}
              disabled={tudFillBusy || !tudFillMatch}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {tudFillBusy ? "Filling..." : "Set size & fill sheet"}
            </button>
            <button
              type="button"
              onClick={() => setTudFill(null)}
              disabled={tudFillBusy}
              className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}
      {tudFillNotice ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {tudFillNotice}
          </p>
          <button
            type="button"
            onClick={() => setTudFillNotice(null)}
            className="rounded p-1 text-emerald-500 hover:bg-emerald-100"
            aria-label="Dismiss notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* View tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "measurements", label: "Measurements" },
            { id: "evolution", label: "Evolution" },
            { id: "history", label: "History" },
          ] as { id: ViewTab; label: string }[]
        ).map((tabDef) => (
          <button
            key={tabDef.id}
            type="button"
            onClick={() => setView(tabDef.id)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              view === tabDef.id
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            )}
          >
            {tabDef.label}
          </button>
        ))}
      </div>

      {view === "measurements" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                pattern.final_version_id
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-900"
              )}
            >
              {trialSheetStatusLabel(pattern)}
            </span>
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setSheetMode("trials")}
                className={cn(
                  "rounded-md px-2.5 py-1.5",
                  sheetMode === "trials" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                )}
              >
                Sample / Trials / Final
              </button>
              <button
                type="button"
                onClick={() => setSheetMode("detail")}
                className={cn(
                  "rounded-md px-2.5 py-1.5",
                  sheetMode === "detail" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                )}
              >
                Trial detail (Sewn / Adjust)
              </button>
            </div>
            <button
              type="button"
              onClick={() => void addTrial()}
              disabled={saving || Boolean(pattern.final_version_id)}
              className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-sm font-medium text-indigo-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add trial
            </button>
            {(() => {
              const current = currentTrialVersion(pattern) ?? version;
              if (!current) return null;
              return (
              <button
                type="button"
                onClick={() => void toggleFinal(current)}
                disabled={saving}
                className={cn(
                  "ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
                  current.is_final
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-white text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
                )}
              >
                <CheckCircle2 className="h-4 w-4" />
                {current.is_final ? "Final version" : "Mark current as final"}
              </button>
              );
            })()}
          </div>

          {sheetMode === "trials" ? (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">
                  Measurement sheet{" "}
                  <span className="font-normal text-slate-500">({unitLabel(unit)})</span>
                </p>
                <button
                  type="button"
                  onClick={() => void saveTrialSheet()}
                  disabled={!dirty || saving}
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm font-medium",
                    dirty
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-slate-100 text-slate-400"
                  )}
                >
                  {saving ? "Saving..." : dirty ? "Save sheet" : "Sheet saved"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Measurement</th>
                      {buildTrialSheetColumns(pattern).map((col) => (
                        <th
                          key={col.key}
                          className={cn(
                            "px-2 py-2 text-center",
                            col.isCurrent ? "bg-amber-50 text-amber-900" : null,
                            col.kind === "final" ? "text-emerald-700" : null
                          )}
                        >
                          {col.label}
                          {col.isCurrent && col.kind !== "final" ? (
                            <span className="mt-0.5 block text-[10px] font-semibold normal-case">
                              current
                            </span>
                          ) : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trialSheetPoints(pattern).map((point) => (
                      <tr key={point.point_id} className="border-b border-slate-100">
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5 font-medium text-slate-800">
                          {point.name}
                          {point.remark ? (
                            <span className="ml-2 text-xs font-normal text-slate-400">
                              {point.remark}
                            </span>
                          ) : null}
                        </td>
                        {buildTrialSheetColumns(pattern).map((col) => {
                          if (col.kind === "sample") {
                            return (
                              <td key={col.key} className="px-1 py-1 text-center">
                                <MeasurementInput
                                  value={sampleValueForPoint(pattern, point.point_id)}
                                  unit={unit}
                                  onCommit={(value) => setSampleValue(point.point_id, value)}
                                />
                              </td>
                            );
                          }
                          if (!col.versionId) {
                            return (
                              <td
                                key={col.key}
                                className="px-2 py-1.5 text-center text-xs text-slate-300"
                              >
                                -
                              </td>
                            );
                          }
                          const trial =
                            pattern.versions.find((v) => v.id === col.versionId) ?? null;
                          return (
                            <td
                              key={col.key}
                              className={cn(
                                "px-1 py-1 text-center",
                                col.isCurrent ? "bg-amber-50/40" : null
                              )}
                            >
                              <MeasurementInput
                                value={trialColumnValue(trial, point.point_id)}
                                unit={unit}
                                onCommit={(value) =>
                                  setTrialTarget(col.versionId!, point.point_id, value)
                                }
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {trialSheetPoints(pattern).length === 0 ? (
                <div className="border-t border-slate-100 px-4 py-6 text-center space-y-3">
                  <p className="text-sm text-slate-600">
                    No measurement rows yet for{" "}
                    <span className="font-medium">{garmentLabel(pattern.garment_type)}</span>.
                    Load the garment template to enter Sample / Trial / Final sizes.
                  </p>
                  {!pattern.base_pattern_id ? (
                    <button
                      type="button"
                      onClick={() => void loadTemplatePoints()}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Ruler className="h-4 w-4" />
                      {saving ? "Loading..." : "Load template points"}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-4 py-3">
                <input
                  value={newPointName}
                  onChange={(e) => setNewPointName(e.target.value)}
                  placeholder="Add measurement point..."
                  className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && addMeasurementRow()}
                />
                <button
                  type="button"
                  onClick={addMeasurementRow}
                  className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                  Add point
                </button>
                <p className="ml-auto text-[11px] text-slate-400">
                  After client trial: edit the current Trial column, update Tuka, re-upload .TUD.
                </p>
              </div>
            </div>
          ) : null}

          {sheetMode === "detail" && version ? (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {pattern.versions.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setSelectedVersionId(candidate.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        candidate.id === selectedVersionId
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                      )}
                    >
                      {versionLabel(candidate)}
                      {candidate.is_final ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : null}
                    </button>
                  ))}
                  <label className="ml-2 inline-flex items-center gap-2 text-xs text-slate-600">
                    Trial date
                    <input
                      type="date"
                      value={version.trial_date ?? ""}
                      onChange={(e) =>
                        mutateVersion((draft) => ({
                          ...draft,
                          trial_date: e.target.value || null,
                        }))
                      }
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => void saveVersion()}
                  disabled={!dirty || saving}
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm font-medium",
                    dirty
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-slate-100 text-slate-400"
                  )}
                >
                  {saving ? "Saving..." : dirty ? "Save detail" : "Detail saved"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Point</th>
                      <th className="px-2 py-2 text-center">Sample</th>
                      <th className="px-2 py-2 text-center">Target</th>
                      <th className="px-2 py-2 text-center">Sewn</th>
                      <th className="px-2 py-2 text-center">Adjust +/-</th>
                      <th className="px-3 py-2">Remarks</th>
                      <th className="w-8 px-1 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {version.measurements.map((row) => (
                      <tr key={row.point_id} className="border-b border-slate-100">
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5 font-medium text-slate-800">
                          {row.name}
                        </td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-slate-500">
                          {formatMeasurement(row.base_value, unit)}
                        </td>
                        <td className="px-1 py-1 text-center">
                          <MeasurementInput
                            value={row.target_value}
                            unit={unit}
                            onCommit={(value) =>
                              setMeasurement(row.point_id, { target_value: value })
                            }
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <MeasurementInput
                            value={row.sewn_value}
                            unit={unit}
                            onCommit={(value) =>
                              setMeasurement(row.point_id, { sewn_value: value })
                            }
                          />
                        </td>
                        <td className="px-1 py-1 text-center">
                          <MeasurementInput
                            value={row.adjustment}
                            unit={unit}
                            onCommit={(value) =>
                              setMeasurement(row.point_id, { adjustment: value })
                            }
                            className={cn(
                              row.adjustment
                                ? row.adjustment > 0
                                  ? "border-emerald-200 bg-emerald-50"
                                  : "border-rose-200 bg-rose-50"
                                : undefined
                            )}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={row.remarks ?? ""}
                            onChange={(e) =>
                              setMeasurement(row.point_id, {
                                remarks: e.target.value || null,
                              })
                            }
                            className="w-36 rounded-md border border-transparent px-1.5 py-1 text-xs text-slate-600 hover:border-slate-200 focus:border-indigo-300 focus:outline-none"
                            placeholder="-"
                          />
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              mutateVersion((draft) => ({
                                ...draft,
                                measurements: draft.measurements.filter(
                                  (candidate) => candidate.point_id !== row.point_id
                                ),
                              }))
                            }
                            className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                            aria-label={`Remove ${row.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-4 border-t border-slate-100 p-4 lg:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    Trial notes / special instructions
                  </span>
                  <textarea
                    value={version.special_instructions ?? ""}
                    onChange={(e) =>
                      mutateVersion((draft) => ({
                        ...draft,
                        special_instructions: e.target.value || null,
                      }))
                    }
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <LibraryFileList
                  files={version.files}
                  uploadUrl={`/api/pattern/library/client-patterns/${pattern.id}/files?version=${version.id}`}
                  downloadUrlBase={`/api/pattern/library/client-patterns/${pattern.id}/files`}
                  onUploaded={handleUploaded}
                  title={`${versionLabel(version)} files`}
                  basePatternName={basePatternName}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {view === "evolution" ? <EvolutionView pattern={pattern} /> : null}
      {view === "history" ? <HistoryTimeline pattern={pattern} /> : null}

      <ClientPhotoAssignmentPanel
        clientId={pattern.client_id}
        patternId={pattern.id}
        linkedLineIds={pattern.linked_fabric_line_ids ?? []}
      />

      <details className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-medium text-slate-600">
          Optional archive: TUKAmrk .tum (not used in shop workflow)
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          You nest/cut from .tud only. .tum attach is optional for archive/future — it is not
          required and does not unlock real outlines from TUD.
        </p>
        <div className="mt-3">
          <LibraryFileList
            files={listMarkerFiles(pattern)}
            uploadUrl={`/api/pattern/library/client-patterns/${pattern.id}/files`}
            downloadUrlBase={`/api/pattern/library/client-patterns/${pattern.id}/files`}
            onUploaded={handleUploaded}
            title="Marker files (optional)"
            formSlot="marker"
            accept={MARKER_UPLOAD_ACCEPT}
            emptyLabel="No .tum attached (normal for TUD-only workflow)."
            uploadLabel="Upload .tum (optional)"
            activeFileId={findActiveMarkerAttachment(pattern)?.id ?? null}
            onActivate={(fileId) => void activateMarkerFile(fileId)}
            activateLabel="Set active"
          />
        </div>
      </details>

      <NestEstimatePanel
        pattern={pattern}
        requiredPieceNames={getGarmentPieces(pattern.garment_type)}
        defaultFabricWidthCm={
          suggestedFabricWidthCm ??
          linkedJobs.find((job) => typeof job.width_cm === "number" && job.width_cm > 0)
            ?.width_cm ??
          null
        }
        defaultFabricWidthSource={suggestedFabricWidthSource}
        onPatternUpdated={() => void load(true)}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <LibraryFileList
          files={listDxfFiles(pattern)}
          uploadUrl={`/api/pattern/library/client-patterns/${pattern.id}/files`}
          downloadUrlBase={`/api/pattern/library/client-patterns/${pattern.id}/files`}
          onUploaded={handleUploaded}
          title="DXF cut outlines (.dxf)"
          accept={DXF_UPLOAD_ACCEPT}
          emptyLabel="No .DXF yet. Upload the AAMA/TUKA cut outlines for the fabric nest board (preferred for real piece shapes; .TUD still works for the parts table)."
          uploadLabel="Upload .DXF"
        />
        {Object.keys(geometryBorrowedFrom).length > 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            Showing cut outlines from linked piece pattern
            {Object.keys(geometryBorrowedFrom).length === 1 ? "" : "s"} (
            {Object.keys(geometryBorrowedFrom).join(", ")}
            ). Upload here to attach .DXF on this consolidated pattern.
          </p>
        ) : null}
      </div>

      <TudVersionHistory
        pattern={pattern}
        onUploaded={handleUploaded}
        onActivate={(fileId) => void activateTudVersion(fileId)}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <LinkedFabricsCard
          clientId={pattern.client_id}
          patternId={pattern.id}
          fabricRefs={pattern.linked_fabric_refs ?? []}
        />
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <LibraryFileList
            files={pattern.files.filter((file) => file.kind !== "dxf")}
            uploadUrl={`/api/pattern/library/client-patterns/${pattern.id}/files`}
            downloadUrlBase={`/api/pattern/library/client-patterns/${pattern.id}/files`}
            onUploaded={handleUploaded}
            title="Other pattern files (Excel, RUL, PDF, images)"
            accept=".tud,.xlsx,.xls,.rul,.pdf,.png,.jpg,.jpeg,.webp,.heic"
            emptyLabel="No other files yet — Excel, RUL, PDF, images."
            basePatternName={basePatternName}
          />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-slate-700">Linked drafting jobs</p>
          {linkedJobs.length === 0 ? (
            <p className="text-xs text-slate-400">
              No pattern jobs reference this master pattern yet. Link one from the job detail page.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {linkedJobs.map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/pattern/jobs/${job.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span>
                      {job.so_number} / {job.garment_type}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {job.status.replace(/_/g, " ")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}

/**
 * Per-measurement evolution across trials: base -> T1 -> T2 -> ... with the delta
 * vs the previous trial colored (emerald = increased, rose = decreased).
 */
function EvolutionView({ pattern }: { pattern: ClientPattern }) {
  const unit = pattern.unit;
  const versions = pattern.versions;

  // Union of points in the order of the latest trial (older-only points appended).
  const pointOrder: { point_id: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const version of [...versions].reverse()) {
    for (const row of version.measurements) {
      if (!seen.has(row.point_id)) {
        seen.add(row.point_id);
        pointOrder.push({ point_id: row.point_id, name: row.name });
      }
    }
  }

  function valueFor(version: ClientPatternVersion, pointId: string): number | null {
    const row = version.measurements.find((candidate) => candidate.point_id === pointId);
    return row ? row.target_value ?? row.sewn_value : null;
  }

  function baseFor(pointId: string): number | null {
    for (const version of versions) {
      const row = version.measurements.find((candidate) => candidate.point_id === pointId);
      if (row && row.base_value !== null) return row.base_value;
    }
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">
          Evolution across trials{" "}
          <span className="font-normal text-slate-500">
            (target values, {unitLabel(unit)} - delta vs previous trial)
          </span>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Point</th>
              <th className="px-3 py-2 text-center">Base</th>
              {versions.map((version) => (
                <th key={version.id} className="px-3 py-2 text-center">
                  T{version.version}
                  {version.is_final ? (
                    <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold normal-case text-emerald-700">
                      Final
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pointOrder.map(({ point_id, name }) => {
              const baseValue = baseFor(point_id);
              let previous = baseValue;
              return (
                <tr key={point_id} className="border-b border-slate-100">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-medium text-slate-800">
                    {name}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums text-slate-500">
                    {formatMeasurement(baseValue, unit)}
                  </td>
                  {versions.map((version) => {
                    const value = valueFor(version, point_id);
                    const delta =
                      value !== null && previous !== null
                        ? Math.round((value - previous) * 1000) / 1000
                        : null;
                    if (value !== null) previous = value;
                    return (
                      <td key={version.id} className="whitespace-nowrap px-3 py-2 text-center">
                        <span className="tabular-nums font-medium text-slate-800">
                          {formatMeasurement(value, unit)}
                        </span>
                        {delta !== null && value !== null ? (
                          <span
                            className={cn(
                              "ml-1.5 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums",
                              delta > 0
                                ? "bg-emerald-50 text-emerald-700"
                                : delta < 0
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-slate-100 text-slate-500"
                            )}
                          >
                            {delta > 0 ? (
                              <MoveUp className="h-2.5 w-2.5" />
                            ) : delta < 0 ? (
                              <MoveDown className="h-2.5 w-2.5" />
                            ) : (
                              <Minus className="h-2.5 w-2.5" />
                            )}
                            {delta === 0 ? "=" : formatMeasurement(Math.abs(delta), unit)}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pointOrder.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-400">No measurements recorded yet.</p>
      ) : null}
    </div>
  );
}

/** Vertical timeline: Trial 1 -> ... -> Final with dates, editors, notes, and files. */
function HistoryTimeline({ pattern }: { pattern: ClientPattern }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <History className="h-4 w-4 text-slate-400" />
        Pattern history
      </p>
      <ol className="relative space-y-6 border-l border-slate-200 pl-5">
        {pattern.versions.map((version) => (
          <li key={version.id} className="relative">
            <span
              className={cn(
                "absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white",
                version.is_final ? "bg-emerald-500" : "bg-indigo-400"
              )}
            />
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-900">Trial {version.version}</p>
              {version.is_final ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  Final
                </span>
              ) : null}
              <span className="text-xs text-slate-500">
                Trial date {formatDate(version.trial_date)} / created {formatDate(version.created_at)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {version.created_by ? `Created by ${version.created_by}` : "Creator unknown"}
              {version.updated_by && version.updated_by !== version.created_by
                ? ` / last edited by ${version.updated_by}`
                : ""}
              {` / ${version.measurements.length} points`}
            </p>
            {version.special_instructions ? (
              <p className="mt-1 text-sm text-slate-700">"{version.special_instructions}"</p>
            ) : null}
            {version.notes ? <p className="mt-1 text-sm text-slate-600">{version.notes}</p> : null}
            {version.files.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {version.files.map((file) => (
                  <li key={file.id}>
                    <a
                      href={`/api/pattern/library/client-patterns/${pattern.id}/files?file=${encodeURIComponent(file.stored_filename)}`}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200"
                    >
                      {file.filename}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-slate-400">
        Pattern created {formatDate(pattern.created_at)} / last updated {formatDate(pattern.updated_at)}
      </p>
    </div>
  );
}
