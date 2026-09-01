"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { entityRefsFromContext } from "@/lib/entity-images/keys";
import type { EntityImage, EntityImageAlbum, EntityImageRef } from "@/lib/types/entity-images";
import { cn } from "@/lib/utils";

function imageSrc(albumKey: string, image: EntityImage): string {
  return `/api/entity-images/${encodeURIComponent(albumKey)}/images/${encodeURIComponent(image.id)}?v=${encodeURIComponent(image.uploaded_at)}`;
}

async function uploadEntityImage(
  ref: EntityImageRef,
  file: File
): Promise<{ ok: true; album: EntityImageAlbum } | { ok: false; error: string }> {
  try {
    const prepareResponse = await fetch("/api/entity-images/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: ref.key,
        label: ref.label,
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
      }),
    });
    const prepared = (await prepareResponse.json().catch(() => ({}))) as {
      mode?: string;
      key?: string;
      label?: string;
      image_id?: string;
      stored_filename?: string;
      content_type?: string;
      upload_url?: string;
      error?: string;
    };
    if (!prepareResponse.ok) {
      return { ok: false, error: prepared.error ?? "Upload failed." };
    }

    if (prepared.mode === "signed" && prepared.upload_url) {
      const put = await fetch(prepared.upload_url, {
        method: "PUT",
        headers: { "Content-Type": prepared.content_type ?? file.type },
        body: file,
      });
      if (!put.ok) return { ok: false, error: "Upload to storage failed. Try again." };
      const registerResponse = await fetch("/api/entity-images/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: prepared.key ?? ref.key,
          label: prepared.label ?? ref.label,
          image_id: prepared.image_id,
          stored_filename: prepared.stored_filename,
          filename: file.name,
          content_type: prepared.content_type ?? file.type,
        }),
      });
      const registered = (await registerResponse.json().catch(() => ({}))) as {
        album?: EntityImageAlbum;
        error?: string;
      };
      if (!registerResponse.ok || !registered.album) {
        return { ok: false, error: registered.error ?? "Could not register the upload." };
      }
      return { ok: true, album: registered.album };
    }

    const form = new FormData();
    form.set("key", ref.key);
    form.set("label", ref.label);
    form.set("file", file);
    const response = await fetch("/api/entity-images/upload", { method: "POST", body: form });
    const payload = (await response.json().catch(() => ({}))) as {
      album?: EntityImageAlbum;
      error?: string;
    };
    if (!response.ok || !payload.album) {
      return { ok: false, error: payload.error ?? "Upload failed." };
    }
    return { ok: true, album: payload.album };
  } catch {
    return { ok: false, error: "Network error during upload. Try again." };
  }
}

function albumKindLabel(kind: EntityImageRef["kind"], label: string): string {
  if (kind === "fabric") return label || "Fabric";
  if (kind === "garment") return label || "Garment";
  if (kind === "inventory_item") return "Photo";
  if (kind === "payroll_adjustment") return "Photo";
  return "This article";
}

export function EntityPhotos({
  supplierId,
  fabricNumber,
  garmentType,
  salesOrderLineId,
  inventoryItemId,
  payrollAdjustmentId,
  compact = true,
  className,
}: {
  supplierId?: string | null;
  fabricNumber?: string | null;
  garmentType?: string | null;
  salesOrderLineId?: string | null;
  inventoryItemId?: string | null;
  payrollAdjustmentId?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const refs = useMemo(
    () =>
      entityRefsFromContext({
        supplierId,
        fabricNumber,
        garmentType,
        salesOrderLineId,
        inventoryItemId,
        payrollAdjustmentId,
      }),
    [supplierId, fabricNumber, garmentType, salesOrderLineId, inventoryItemId, payrollAdjustmentId]
  );
  const [albums, setAlbums] = useState<EntityImageAlbum[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    if (refs.length === 0) {
      setAlbums([]);
      return;
    }
    try {
      const params = new URLSearchParams();
      for (const ref of refs) params.append("keys", ref.key);
      const response = await fetch(`/api/entity-images?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        albums?: EntityImageAlbum[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Failed to load photos.");
      setAlbums(payload.albums ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photos.");
    }
  }, [refs]);

  useEffect(() => {
    void load();
  }, [load]);

  if (refs.length === 0) return null;

  async function handleFiles(ref: EntityImageRef, files: FileList | null) {
    if (!files?.length) return;
    setBusyKey(ref.key);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const result = await uploadEntityImage(ref, file);
        if (!result.ok) {
          setError(result.error);
          break;
        }
        setAlbums((current) => {
          const next = current.filter((row) => row.key !== result.album.key);
          next.push(result.album);
          return next;
        });
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDelete(albumKey: string, imageId: string) {
    setBusyKey(albumKey);
    setError(null);
    try {
      const response = await fetch(
        `/api/entity-images/${encodeURIComponent(albumKey)}/images/${encodeURIComponent(imageId)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        album?: EntityImageAlbum;
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Could not delete photo.");
        return;
      }
      if (payload.album) {
        setAlbums((current) =>
          current.map((row) => (row.key === payload.album!.key ? payload.album! : row))
        );
      }
    } finally {
      setBusyKey(null);
    }
  }

  const thumbClass = compact ? "h-10 w-10" : "h-16 w-16";

  return (
    <div className={cn("space-y-1.5", className)}>
      {refs.map((ref) => {
        const album = albums.find((row) => row.key === ref.key);
        const images = album?.images ?? [];
        const busy = busyKey === ref.key;
        return (
          <div key={ref.key} className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {albumKindLabel(ref.kind, ref.label)}
            </span>
            {images.map((image) => (
              <div key={image.id} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSrc(ref.key, image)}
                  alt={image.filename}
                  className={cn(thumbClass, "rounded border border-slate-200 object-cover")}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDelete(ref.key, image.id)}
                  className="absolute -right-1 -top-1 hidden rounded-full bg-red-600 p-0.5 text-white group-hover:block disabled:opacity-50"
                  title="Delete photo"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <input
              ref={(node) => {
                inputRefs.current[ref.key] = node;
              }}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleFiles(ref, event.target.files);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRefs.current[ref.key]?.click()}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title={`Upload ${albumKindLabel(ref.kind, ref.label)} photo`}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
              Add
            </button>
          </div>
        );
      })}
      {error ? <p className="text-[11px] text-red-700">{error}</p> : null}
    </div>
  );
}
