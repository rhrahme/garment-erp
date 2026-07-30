"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ThreadButtonPhoto } from "@/lib/types/thread-button-matching";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/*";

type UploadProgressItem = {
  id: string;
  name: string;
  totalBytes: number;
  loadedBytes: number;
  status: "uploading" | "done" | "error";
};

type ThreadButtonPhotosPanelProps = {
  salesOrderLineId: string;
  photos: ThreadButtonPhoto[];
  readOnly?: boolean;
  isAdmin?: boolean;
  currentEmail?: string | null;
  onPhotosChange: (photos: ThreadButtonPhoto[]) => void;
  onError?: (message: string | null) => void;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function photoUrl(photo: ThreadButtonPhoto): string {
  return `/api/thread-button-matching/photos/${encodeURIComponent(photo.id)}?v=${encodeURIComponent(photo.uploaded_at)}`;
}

function uploadPhoto(
  salesOrderLineId: string,
  file: File,
  onProgress: (loaded: number, total: number) => void
): Promise<ThreadButtonPhoto> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("sales_order_line_id", salesOrderLineId);
    form.set("photo", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/thread-button-matching/photos");
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(event.loaded, event.total);
    };

    xhr.onload = () => {
      const body = (xhr.response ?? {}) as { photo?: ThreadButtonPhoto; error?: string };
      if (xhr.status >= 200 && xhr.status < 300 && body.photo) {
        onProgress(file.size, file.size);
        resolve(body.photo);
        return;
      }
      reject(new Error(body.error ?? "Failed to upload photo."));
    };

    xhr.onerror = () => reject(new Error("Failed to upload photo."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(form);
  });
}

export function ThreadButtonPhotosPanel({
  salesOrderLineId,
  photos,
  readOnly = false,
  isAdmin = false,
  currentEmail = null,
  onPhotosChange,
  onError,
}: ThreadButtonPhotosPanelProps) {
  const [uploads, setUploads] = useState<UploadProgressItem[]>([]);
  const [busy, setBusy] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const pendingDeletes = photos.filter((photo) => Boolean(photo.delete_requested_at));

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || readOnly) return;
    onError?.(null);
    const files = Array.from(fileList).filter((file) => file.size > 0);
    if (files.length === 0) return;

    const nextPhotos = [...photos];
    for (const file of files) {
      const uploadId = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setUploads((current) => [
        ...current,
        {
          id: uploadId,
          name: file.name,
          totalBytes: file.size,
          loadedBytes: 0,
          status: "uploading",
        },
      ]);
      try {
        const photo = await uploadPhoto(salesOrderLineId, file, (loaded, total) => {
          setUploads((current) =>
            current.map((item) =>
              item.id === uploadId
                ? { ...item, loadedBytes: loaded, totalBytes: total || file.size }
                : item
            )
          );
        });
        nextPhotos.push(photo);
        onPhotosChange([...nextPhotos]);
        setUploads((current) =>
          current.map((item) =>
            item.id === uploadId ? { ...item, status: "done", loadedBytes: item.totalBytes } : item
          )
        );
      } catch (caught) {
        setUploads((current) =>
          current.map((item) => (item.id === uploadId ? { ...item, status: "error" } : item))
        );
        onError?.(caught instanceof Error ? caught.message : "Failed to upload photo.");
      }
    }
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  async function postAction(photoId: string, action: string) {
    setBusy(true);
    onError?.(null);
    try {
      const res = await fetch(`/api/thread-button-matching/photos/${encodeURIComponent(photoId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { photo?: ThreadButtonPhoto; error?: string; deleted?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Action failed.");
      if (data.deleted || action === "confirm_delete") {
        onPhotosChange(photos.filter((photo) => photo.id !== photoId));
      } else if (data.photo) {
        onPhotosChange(photos.map((photo) => (photo.id === photoId ? data.photo! : photo)));
      }
    } catch (caught) {
      onError?.(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function hardDelete(photoId: string) {
    setBusy(true);
    onError?.(null);
    try {
      const res = await fetch(`/api/thread-button-matching/photos/${encodeURIComponent(photoId)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete photo.");
      onPhotosChange(photos.filter((photo) => photo.id !== photoId));
    } catch (caught) {
      onError?.(caught instanceof Error ? caught.message : "Failed to delete photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Photos</p>
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-[40px]"
              disabled={busy}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="mr-1.5 h-4 w-4" />
              Take photo
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-[40px]"
              disabled={busy}
              onClick={() => galleryInputRef.current?.click()}
            >
              <ImagePlus className="mr-1.5 h-4 w-4" />
              Add from gallery
            </Button>
            <input
              ref={cameraInputRef}
              type="file"
              accept={ACCEPT}
              capture="environment"
              className="hidden"
              onChange={(event) => void handleFiles(event.target.files)}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={(event) => void handleFiles(event.target.files)}
            />
          </div>
        ) : null}
      </div>

      {isAdmin && pendingDeletes.length > 0 ? (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-semibold">Pending deletions ({pendingDeletes.length})</p>
          <ul className="mt-2 space-y-2">
            {pendingDeletes.map((photo) => (
              <li key={photo.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate">{photo.filename}</span>
                <span className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void postAction(photo.id, "keep")}
                  >
                    Keep
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => void postAction(photo.id, "confirm_delete")}
                  >
                    Confirm delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {uploads.length > 0 ? (
        <ul className="mb-3 space-y-2">
          {uploads.map((item) => {
            const pct =
              item.totalBytes > 0
                ? Math.min(100, Math.round((item.loadedBytes / item.totalBytes) * 100))
                : 0;
            return (
              <li key={item.id} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                <div className="mb-1 flex justify-between gap-2">
                  <span className="truncate font-medium text-slate-800">{item.name}</span>
                  <span>
                    {item.status === "error"
                      ? "Failed"
                      : item.status === "done"
                        ? "Done"
                        : `${pct}% ' ${formatBytes(item.totalBytes - item.loadedBytes)} left`}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      "h-full transition-all",
                      item.status === "error"
                        ? "bg-rose-500"
                        : item.status === "done"
                          ? "bg-emerald-500"
                          : "bg-indigo-500"
                    )}
                    style={{ width: `${item.status === "done" ? 100 : pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {photos.length === 0 ? (
        <p className="text-sm text-slate-500">No photos yet. Take a photo of thread or buttons for this article.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo) => {
            const pending = Boolean(photo.delete_requested_at);
            const canCancelOwn =
              pending &&
              !isAdmin &&
              currentEmail &&
              photo.delete_requested_by === currentEmail;
            return (
              <li
                key={photo.id}
                className={cn(
                  "relative overflow-hidden rounded-lg bg-white ring-1 ring-slate-200",
                  pending && "ring-amber-400"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl(photo)}
                  alt={photo.filename}
                  className="aspect-square w-full object-cover"
                />
                {!readOnly ? (
                  <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                    {isAdmin ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-md bg-white/90 p-1.5 text-rose-700 disabled:opacity-50"
                        title="Delete"
                        onClick={() => void hardDelete(photo.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : pending ? (
                      canCancelOwn ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-800 disabled:opacity-50"
                          onClick={() => void postAction(photo.id, "cancel_request")}
                        >
                          Cancel request
                        </button>
                      ) : (
                        <span className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">
                          Delete requested
                        </span>
                      )
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-md bg-white/90 p-1.5 text-rose-700 disabled:opacity-50"
                        title="Request delete"
                        onClick={() => void postAction(photo.id, "request_delete")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ) : null}
                {busy ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/40">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
