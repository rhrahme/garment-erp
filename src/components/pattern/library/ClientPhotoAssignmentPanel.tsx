"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera, CheckSquare, Link2, Printer, Send, Square, Unlink } from "lucide-react";
import type {
  ClientFabricBoard,
  ClientFabricBoardRow,
} from "@/lib/pattern-library/client-fabric-board";
import type { ClientPhoto } from "@/lib/types/sales-workspace";
import { cn } from "@/lib/utils";

function isVideo(photo: ClientPhoto): boolean {
  return (photo.content_type || "").startsWith("video/");
}

function fabricOptionLabel(row: ClientFabricBoardRow): string {
  const parts = [
    row.article_code || row.fabric_number || "Fabric",
    row.so_number || null,
    row.garment_type || null,
    row.color || null,
  ].filter(Boolean);
  return parts.join(" / ");
}

function photoMediaUrl(photo: ClientPhoto): string {
  return `/api/sales/client-photos/${encodeURIComponent(photo.id)}?v=${encodeURIComponent(photo.uploaded_at)}`;
}

type PhotoBucket = "on_sheet" | "unassigned" | "other";

function bucketForPhoto(
  photo: ClientPhoto,
  patternId: string,
  linkedLineIds: Set<string>
): PhotoBucket {
  if (
    photo.assigned_client_pattern_id === patternId ||
    (photo.assigned_fabric_line_id != null && linkedLineIds.has(photo.assigned_fabric_line_id))
  ) {
    return "on_sheet";
  }
  if (!photo.assigned_fabric_line_id) return "unassigned";
  return "other";
}

export function ClientPhotoAssignmentPanel({
  clientId,
  patternId,
  linkedLineIds,
}: {
  clientId: string;
  patternId: string;
  linkedLineIds: string[];
}) {
  const [photos, setPhotos] = useState<ClientPhoto[]>([]);
  const [fabricRows, setFabricRows] = useState<ClientFabricBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [assignLineId, setAssignLineId] = useState("");
  const [printSelectedIds, setPrintSelectedIds] = useState<Set<string>>(new Set());

  const linkedSet = useMemo(() => new Set(linkedLineIds), [linkedLineIds]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [photoRes, fabricRes] = await Promise.all([
        fetch(`/api/sales/client-photos?client_id=${encodeURIComponent(clientId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/pattern/library/client-fabrics/${clientId}?t=${Date.now()}`, {
          cache: "no-store",
        }),
      ]);
      if (!photoRes.ok) throw new Error("Could not load client photos.");
      const photoData = await photoRes.json();
      setPhotos(photoData.photos ?? []);
      if (fabricRes.ok) {
        const board: ClientFabricBoard = await fabricRes.json();
        setFabricRows(board.rows ?? []);
      } else {
        setFabricRows([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photos.");
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fabricOptions = useMemo(() => {
    const preferred = fabricRows.filter(
      (row) => linkedSet.has(row.line_id) || row.assigned_pattern?.pattern_id === patternId
    );
    const rest = fabricRows.filter((row) => !preferred.some((p) => p.line_id === row.line_id));
    return [...preferred, ...rest];
  }, [fabricRows, linkedSet, patternId]);

  const sheetFabricOptions = useMemo(
    () =>
      fabricOptions.filter(
        (row) => linkedSet.has(row.line_id) || row.assigned_pattern?.pattern_id === patternId
      ),
    [fabricOptions, linkedSet, patternId]
  );

  const defaultSheetLineId = sheetFabricOptions[0]?.line_id ?? fabricOptions[0]?.line_id ?? "";

  const buckets = useMemo(() => {
    const on_sheet: ClientPhoto[] = [];
    const unassigned: ClientPhoto[] = [];
    const other: ClientPhoto[] = [];
    for (const photo of photos) {
      const bucket = bucketForPhoto(photo, patternId, linkedSet);
      if (bucket === "on_sheet") on_sheet.push(photo);
      else if (bucket === "unassigned") unassigned.push(photo);
      else other.push(photo);
    }
    return { on_sheet, unassigned, other };
  }, [photos, patternId, linkedSet]);

  const selectedPhoto = photos.find((p) => p.id === selectedPhotoId) ?? null;

  const printHref = useMemo(() => {
    const base = `/pattern/client-patterns/${encodeURIComponent(patternId)}/photos/print`;
    if (printSelectedIds.size > 0) {
      return `${base}?ids=${encodeURIComponent([...printSelectedIds].join(","))}`;
    }
    return base;
  }, [patternId, printSelectedIds]);

  async function assign(photoId: string, fabricLineId: string | null) {
    setBusyId(photoId);
    setError(null);
    try {
      const res = await fetch(`/api/sales/client-photos/${encodeURIComponent(photoId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: fabricLineId ? "assign" : "unassign",
          fabric_line_id: fabricLineId,
          client_pattern_id: patternId,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Assignment failed.");
      setPhotos((current) =>
        current.map((photo) => (photo.id === photoId ? (body.photo as ClientPhoto) : photo))
      );
      setSelectedPhotoId(null);
      setAssignLineId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assignment failed.");
    } finally {
      setBusyId(null);
    }
  }

  function togglePrintSelect(photoId: string) {
    setPrintSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  function selectAllForPrint(list: ClientPhoto[]) {
    setPrintSelectedIds((current) => {
      const next = new Set(current);
      for (const photo of list) {
        if (!isVideo(photo)) next.add(photo.id);
      }
      return next;
    });
  }

  function openAssign(photo: ClientPhoto, preferredLineId?: string) {
    setSelectedPhotoId(photo.id);
    setAssignLineId(
      preferredLineId ||
        photo.assigned_fabric_line_id ||
        defaultSheetLineId ||
        ""
    );
  }

  function renderPhotoCard(photo: ClientPhoto, bucket: PhotoBucket) {
    const mediaUrl = photoMediaUrl(photo);
    const checked = printSelectedIds.has(photo.id);
    const onSheet = bucket === "on_sheet";
    const quickLineId =
      sheetFabricOptions.length === 1 ? sheetFabricOptions[0].line_id : defaultSheetLineId;

    return (
      <div
        key={photo.id}
        className={cn(
          "overflow-hidden rounded-lg border",
          selectedPhotoId === photo.id
            ? "border-indigo-400 ring-2 ring-indigo-200"
            : onSheet
              ? "border-emerald-200"
              : "border-slate-200"
        )}
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => openAssign(photo)}
            className="block w-full bg-slate-100"
          >
            {isVideo(photo) ? (
              <video src={mediaUrl} className="h-36 w-full object-cover" muted playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl}
                alt={photo.filename}
                className="h-36 w-full object-cover"
              />
            )}
          </button>
          {!isVideo(photo) ? (
            <button
              type="button"
              onClick={() => togglePrintSelect(photo.id)}
              className="absolute left-2 top-2 rounded bg-white/90 p-1 text-slate-700 shadow ring-1 ring-slate-200 hover:bg-white"
              title={checked ? "Deselect for print" : "Select for print"}
            >
              {checked ? (
                <CheckSquare className="h-4 w-4 text-indigo-600" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </button>
          ) : null}
        </div>
        <div className="space-y-1.5 p-2.5">
          {photo.assigned_fabric_line_id ? (
            <p className="text-xs font-medium text-emerald-700">
              {photo.assigned_article_number || "Fabric line"}
              {photo.assigned_so_number ? ` / ${photo.assigned_so_number}` : ""}
            </p>
          ) : (
            <p className="text-xs text-slate-400">Not assigned</p>
          )}
          {onSheet ? (
            <p className="text-[10px] font-medium text-emerald-600">On this sheet</p>
          ) : bucket === "other" ? (
            <p className="text-[10px] text-amber-700">Assigned to another sheet</p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {bucket !== "on_sheet" && quickLineId ? (
              <button
                type="button"
                disabled={busyId === photo.id}
                onClick={() => {
                  if (sheetFabricOptions.length === 1) {
                    void assign(photo.id, quickLineId);
                  } else {
                    openAssign(photo, quickLineId);
                  }
                }}
                className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send className="h-3 w-3" />
                {sheetFabricOptions.length === 1 ? "Send to this sheet" : "Send to sheet..."}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => openAssign(photo)}
              className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px] font-medium text-indigo-700 ring-1 ring-slate-200 hover:bg-indigo-50"
            >
              <Link2 className="h-3 w-3" />
              {photo.assigned_fabric_line_id ? "Change fabric" : "Pick fabric"}
            </button>
            {photo.assigned_fabric_line_id ? (
              <button
                type="button"
                disabled={busyId === photo.id}
                onClick={() => void assign(photo.id, null)}
                className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
              >
                <Unlink className="h-3 w-3" />
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  function renderSection(
    title: string,
    hint: string,
    list: ClientPhoto[],
    bucket: PhotoBucket
  ) {
    if (list.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              {title} ({list.length})
            </p>
            <p className="text-[11px] text-slate-400">{hint}</p>
          </div>
          <button
            type="button"
            onClick={() => selectAllForPrint(list)}
            className="text-[11px] font-medium text-indigo-700 hover:text-indigo-900"
          >
            Select for print
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((photo) => renderPhotoCard(photo, bucket))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Camera className="h-4 w-4 text-slate-400" />
            Client photos
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Sales uploads on the client profile. Pattern sends each photo to the matching fabric /
            article on this sheet, then prints.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {printSelectedIds.size > 0 ? (
            <button
              type="button"
              onClick={() => setPrintSelectedIds(new Set())}
              className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Clear selection ({printSelectedIds.size})
            </button>
          ) : null}
          <Link
            href={printHref}
            target="_blank"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
              buckets.on_sheet.length > 0 || printSelectedIds.size > 0
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            )}
          >
            <Printer className="h-4 w-4" />
            {printSelectedIds.size > 0
              ? `Print images (${printSelectedIds.size})`
              : "Print images"}
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading photos...</p>
      ) : photos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
          No wearing photos yet. Ask Sales to upload them on the client profile.
        </p>
      ) : (
        <div className="space-y-5">
          {renderSection(
            "On this sheet",
            "Photos already sent to a fabric / article linked here.",
            buckets.on_sheet,
            "on_sheet"
          )}
          {renderSection(
            "Unassigned",
            "Send pink shirt pics to the shirt fabric, navy trousers to the trouser fabric, etc.",
            buckets.unassigned,
            "unassigned"
          )}
          {renderSection(
            "Other sheets",
            "Assigned elsewhere - you can re-send them to this sheet if needed.",
            buckets.other,
            "other"
          )}
        </div>
      )}

      {selectedPhoto ? (
        <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">
            Send photo to fabric / article on this sheet
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[16rem] flex-1 text-xs">
              <span className="mb-1 block text-slate-600">Target fabric / article</span>
              <select
                value={assignLineId}
                onChange={(e) => setAssignLineId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select fabric / article...</option>
                {sheetFabricOptions.length > 0 ? (
                  <optgroup label="This sheet">
                    {sheetFabricOptions.map((row) => (
                      <option key={row.line_id} value={row.line_id}>
                        {fabricOptionLabel(row)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {fabricOptions.filter(
                  (row) => !sheetFabricOptions.some((s) => s.line_id === row.line_id)
                ).length > 0 ? (
                  <optgroup label="Other client fabrics">
                    {fabricOptions
                      .filter((row) => !sheetFabricOptions.some((s) => s.line_id === row.line_id))
                      .map((row) => (
                        <option key={row.line_id} value={row.line_id}>
                          {fabricOptionLabel(row)}
                        </option>
                      ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
            <button
              type="button"
              disabled={!assignLineId || busyId === selectedPhoto.id}
              onClick={() => void assign(selectedPhoto.id, assignLineId)}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busyId === selectedPhoto.id ? "Sending..." : "Send to sheet"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedPhotoId(null);
                setAssignLineId("");
              }}
              className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200"
            >
              Cancel
            </button>
          </div>
          {fabricOptions.length === 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              No fabric lines found for this client. Consolidate fabrics onto this pattern first.
            </p>
          ) : sheetFabricOptions.length === 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              No fabrics linked to this sheet yet. Link fabrics above, or pick any client fabric
              below.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
