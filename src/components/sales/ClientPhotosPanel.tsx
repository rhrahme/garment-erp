"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ClientPhoto } from "@/lib/types/sales-workspace";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/*";

type ClientPhotosPanelProps = {
  clientId: string | null;
  /** When false, show a short “save client first” hint instead of upload controls. */
  clientReady?: boolean;
  className?: string;
  /** Optional controlled photos (Sales workspace). When omitted, the panel loads via API. */
  photos?: ClientPhoto[];
  onPhotosChange?: (photos: ClientPhoto[]) => void;
  onError?: (message: string | null) => void;
};

type UploadProgressItem = {
  id: string;
  name: string;
  totalBytes: number;
  loadedBytes: number;
  status: "uploading" | "done" | "error";
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function uploadClientPhoto(
  clientId: string,
  file: File,
  onProgress: (loaded: number, total: number) => void
): Promise<ClientPhoto> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.set("client_id", clientId);
    form.set("photo", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/sales/client-photos");
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(event.loaded, event.total);
    };

    xhr.onload = () => {
      const body = (xhr.response ?? {}) as { photo?: ClientPhoto; error?: string };
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

export function ClientPhotosPanel({
  clientId,
  clientReady = true,
  className,
  photos: controlledPhotos,
  onPhotosChange,
  onError,
}: ClientPhotosPanelProps) {
  const [internalPhotos, setInternalPhotos] = useState<ClientPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState<UploadProgressItem[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const photos = controlledPhotos ?? internalPhotos;
  const isControlled = controlledPhotos !== undefined;

  const reportError = useCallback(
    (message: string | null) => {
      setLocalError(message);
      onError?.(message);
    },
    [onError]
  );

  const applyPhotos = useCallback(
    (next: ClientPhoto[]) => {
      if (!isControlled) setInternalPhotos(next);
      onPhotosChange?.(next);
    },
    [isControlled, onPhotosChange]
  );

  const loadPhotos = useCallback(async () => {
    if (!clientId || !clientReady) {
      applyPhotos([]);
      return;
    }
    if (isControlled) return;
    setLoading(true);
    reportError(null);
    try {
      const response = await fetch(
        `/api/sales/client-photos?client_id=${encodeURIComponent(clientId)}`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as { photos?: ClientPhoto[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Failed to load photos.");
      applyPhotos(body.photos ?? []);
    } catch (caught) {
      reportError(caught instanceof Error ? caught.message : "Failed to load photos.");
      applyPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [applyPhotos, clientId, clientReady, isControlled, reportError]);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  async function uploadFiles(fileList: FileList | File[] | null) {
    if (!clientId || !clientReady || !fileList) return;
    const files = Array.from(fileList).filter((file) => file.size > 0);
    if (files.length === 0) return;

    const items: UploadProgressItem[] = files.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      totalBytes: file.size,
      loadedBytes: 0,
      status: "uploading",
    }));

    setBusy(true);
    setUploads(items);
    reportError(null);
    try {
      const uploaded: ClientPhoto[] = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const itemId = items[index].id;
        try {
          const photo = await uploadClientPhoto(clientId, file, (loaded, total) => {
            setUploads((prev) =>
              prev.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      loadedBytes: loaded,
                      totalBytes: total > 0 ? total : item.totalBytes,
                      status: "uploading",
                    }
                  : item
              )
            );
          });
          uploaded.push(photo);
          setUploads((prev) =>
            prev.map((item) =>
              item.id === itemId
                ? { ...item, loadedBytes: item.totalBytes, status: "done" }
                : item
            )
          );
        } catch (caught) {
          setUploads((prev) =>
            prev.map((item) => (item.id === itemId ? { ...item, status: "error" } : item))
          );
          throw caught;
        }
      }
      if (isControlled) {
        applyPhotos([...photos, ...uploaded]);
      } else {
        await loadPhotos();
      }
    } catch (caught) {
      reportError(caught instanceof Error ? caught.message : "Failed to upload photo.");
    } finally {
      setBusy(false);
      setUploads([]);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  }

  async function deletePhoto(photoId: string) {
    if (!clientId) return;
    const confirmed = window.confirm("Delete this photo?");
    if (!confirmed) return;

    setBusy(true);
    reportError(null);
    try {
      const response = await fetch(`/api/sales/client-photos/${encodeURIComponent(photoId)}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Failed to delete photo.");
      applyPhotos(photos.filter((photo) => photo.id !== photoId));
    } catch (caught) {
      reportError(caught instanceof Error ? caught.message : "Failed to delete photo.");
    } finally {
      setBusy(false);
    }
  }

  const disabled = !clientId || !clientReady || busy;

  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Photos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Take a picture or pick from the gallery — works well on tablet.
          </p>
        </div>
        {photos.length > 0 && (
          <p className="text-sm font-medium text-slate-600">
            {photos.length} photo{photos.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {!clientReady && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Save the client first, then add photos.
        </p>
      )}

      {clientReady && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => cameraInputRef.current?.click()}
            className="flex min-h-[4.5rem] items-center justify-center gap-3 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 px-4 py-4 text-base font-semibold text-indigo-800 transition-colors hover:border-indigo-400 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
            Take photo
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => galleryInputRef.current?.click()}
            className="flex min-h-[4.5rem] items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-base font-semibold text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
            Add from gallery
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept={ACCEPT}
            capture="environment"
            className="sr-only"
            disabled={disabled}
            onChange={(event) => void uploadFiles(event.target.files)}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            disabled={disabled}
            onChange={(event) => void uploadFiles(event.target.files)}
          />
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="mt-4 space-y-2" aria-live="polite">
          {uploads.map((item) => {
            const total = item.totalBytes || 1;
            const pct = Math.min(100, Math.round((item.loadedBytes / total) * 100));
            const remaining = Math.max(0, item.totalBytes - item.loadedBytes);
            const label =
              item.status === "done"
                ? "Uploaded"
                : item.status === "error"
                  ? "Failed"
                  : `${pct}% · ${formatBytes(item.loadedBytes)} of ${formatBytes(item.totalBytes)} · ${formatBytes(remaining)} left`;

            return (
              <li
                key={item.id}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatBytes(item.totalBytes)} · {label}
                    </p>
                  </div>
                  {item.status === "uploading" && (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-400" />
                  )}
                </div>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-label={`Uploading ${item.name}`}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-150 ease-out",
                      item.status === "error"
                        ? "bg-red-500"
                        : item.status === "done"
                          ? "bg-emerald-500"
                          : "bg-indigo-500"
                    )}
                    style={{ width: `${item.status === "error" ? pct : Math.max(pct, 2)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(localError || loading) && (
        <div className="mt-3">
          {localError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {localError}
            </p>
          )}
          {loading && !localError && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading photos…
            </p>
          )}
        </div>
      )}

      {photos.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.id} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/sales/client-photos/${encodeURIComponent(photo.id)}`}
                alt={photo.filename}
                className="aspect-square w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/60 to-transparent p-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  className="min-h-10 bg-white/95 text-red-700 hover:bg-white"
                  onClick={() => void deletePhoto(photo.id)}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        clientReady &&
        !loading &&
        uploads.length === 0 && (
          <p className="mt-4 text-center text-sm text-slate-500">No photos yet — tap Take photo to start.</p>
        )
      )}
    </section>
  );
}
