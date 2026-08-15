"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { clientMediaAcceptAttribute } from "@/lib/data/client-media-types";
import { cn } from "@/lib/utils";
import type { ClientPhoto } from "@/lib/types/sales-workspace";

const ACCEPT = clientMediaAcceptAttribute();

function isDeletePending(photo: ClientPhoto): boolean {
  return Boolean(photo.delete_requested_at);
}

function isVideoPhoto(photo: ClientPhoto): boolean {
  return (
    photo.content_type.toLowerCase().startsWith("video/") ||
    /\.(mp4|m4v|mov|webm|3gp|3g2)$/i.test(photo.filename) ||
    /\.(mp4|m4v|mov|webm|3gp|3g2)$/i.test(photo.stored_filename)
  );
}

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

type MediaCapabilities = {
  email: string | null;
  canHardDelete: boolean;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** XHR with upload progress; resolves the parsed JSON-ish response. */
function xhrSend(
  method: string,
  url: string,
  body: FormData | File,
  contentType: string | null,
  onProgress: (loaded: number, total: number) => void
): Promise<{ status: number; response: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(event.loaded, event.total);
    };
    xhr.onload = () => {
      let parsed: unknown = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        parsed = null;
      }
      resolve({ status: xhr.status, response: parsed });
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(body);
  });
}

type SignedUpload = {
  mode?: "signed" | "direct";
  photo_id?: string;
  stored_filename?: string;
  content_type?: string;
  upload_url?: string;
  error?: string;
};

/**
 * Upload path: ask the API for a Supabase signed upload URL, PUT the file
 * straight to storage (Vercel caps API request bodies at ~4.5 MB, so large
 * phone photos/videos can never go through /api/sales/client-photos in
 * production), then register the photo. Falls back to the legacy multipart
 * POST when the API says direct (local dev) or the signed step is unavailable.
 */
async function uploadViaSignedUrl(
  target: { client_id: string } | { replace_photo_id: string },
  file: File,
  onProgress: (loaded: number, total: number) => void
): Promise<ClientPhoto | null> {
  const prepareResponse = await fetch("/api/sales/client-photos/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...target,
      filename: file.name || "upload",
      content_type: file.type || "",
      size_bytes: file.size,
    }),
  });
  const prepared = (await prepareResponse.json().catch(() => ({}))) as SignedUpload;
  if (!prepareResponse.ok) {
    throw new Error(prepared.error ?? "Failed to prepare upload.");
  }
  if (prepared.mode !== "signed" || !prepared.upload_url) return null;

  const put = await xhrSend(
    "PUT",
    prepared.upload_url,
    file,
    prepared.content_type ?? file.type ?? "application/octet-stream",
    onProgress
  );
  if (put.status < 200 || put.status >= 300) {
    throw new Error("Failed to upload the file to storage. Check the connection and retry.");
  }

  const registerResponse = await fetch("/api/sales/client-photos/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...target,
      photo_id: prepared.photo_id,
      stored_filename: prepared.stored_filename,
      filename: file.name || "upload",
      content_type: prepared.content_type ?? file.type ?? "",
    }),
  });
  const registered = (await registerResponse.json().catch(() => ({}))) as {
    photo?: ClientPhoto;
    error?: string;
  };
  if (!registerResponse.ok || !registered.photo) {
    throw new Error(registered.error ?? "Uploaded, but failed to save the photo. Retry.");
  }
  onProgress(file.size, file.size);
  return registered.photo;
}

async function uploadClientPhoto(
  clientId: string,
  file: File,
  onProgress: (loaded: number, total: number) => void
): Promise<ClientPhoto> {
  const signed = await uploadViaSignedUrl({ client_id: clientId }, file, onProgress);
  if (signed) return signed;

  const form = new FormData();
  form.set("client_id", clientId);
  form.set("photo", file);
  const result = await xhrSend("POST", "/api/sales/client-photos", form, null, onProgress);
  const body = (result.response ?? {}) as { photo?: ClientPhoto; error?: string };
  if (result.status >= 200 && result.status < 300 && body.photo) {
    onProgress(file.size, file.size);
    return body.photo;
  }
  throw new Error(body.error ?? "Failed to upload photo.");
}

async function replaceClientPhoto(
  photoId: string,
  file: File,
  onProgress: (loaded: number, total: number) => void
): Promise<ClientPhoto> {
  const signed = await uploadViaSignedUrl({ replace_photo_id: photoId }, file, onProgress);
  if (signed) return signed;

  const form = new FormData();
  form.set("action", "replace");
  form.set("photo", file);
  const result = await xhrSend(
    "POST",
    `/api/sales/client-photos/${encodeURIComponent(photoId)}`,
    form,
    null,
    onProgress
  );
  const body = (result.response ?? {}) as { photo?: ClientPhoto; error?: string };
  if (result.status >= 200 && result.status < 300 && body.photo) {
    onProgress(file.size, file.size);
    return body.photo;
  }
  throw new Error(body.error ?? "Failed to replace photo.");
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
  const [capabilities, setCapabilities] = useState<MediaCapabilities>({
    email: null,
    canHardDelete: false,
  });
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replacePhotoIdRef = useRef<string | null>(null);

  const photos = controlledPhotos ?? internalPhotos;
  const isControlled = controlledPhotos !== undefined;
  const pendingDeletes = photos.filter((photo) => isDeletePending(photo));

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

  const patchPhoto = useCallback(
    (photoId: string, next: ClientPhoto | null) => {
      applyPhotos(
        next
          ? photos.map((photo) => (photo.id === photoId ? next : photo))
          : photos.filter((photo) => photo.id !== photoId)
      );
    },
    [applyPhotos, photos]
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

  useEffect(() => {
    async function loadCapabilities() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          email?: string | null;
          can_hard_delete_client_media?: boolean;
          is_admin?: boolean;
        };
        setCapabilities({
          email: data.email ?? null,
          canHardDelete: Boolean(data.can_hard_delete_client_media ?? data.is_admin),
        });
      } catch {
        /* ignore */
      }
    }
    void loadCapabilities();
  }, []);

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
    const confirmed = window.confirm("Delete this photo permanently?");
    if (!confirmed) return;

    setBusy(true);
    reportError(null);
    try {
      const response = await fetch(`/api/sales/client-photos/${encodeURIComponent(photoId)}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Failed to delete photo.");
      patchPhoto(photoId, null);
    } catch (caught) {
      reportError(caught instanceof Error ? caught.message : "Failed to delete photo.");
    } finally {
      setBusy(false);
    }
  }

  async function postPhotoAction(
    photoId: string,
    action: "request_delete" | "cancel_request" | "keep" | "confirm_delete"
  ) {
    setBusy(true);
    reportError(null);
    try {
      const response = await fetch(`/api/sales/client-photos/${encodeURIComponent(photoId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json()) as { photo?: ClientPhoto; error?: string; ok?: boolean };
      if (!response.ok) throw new Error(body.error ?? "Action failed.");
      if (action === "confirm_delete") {
        patchPhoto(photoId, null);
      } else if (body.photo) {
        patchPhoto(photoId, body.photo);
      }
    } catch (caught) {
      reportError(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  function startReplace(photoId: string) {
    replacePhotoIdRef.current = photoId;
    replaceInputRef.current?.click();
  }

  async function onReplaceFiles(fileList: FileList | null) {
    const photoId = replacePhotoIdRef.current;
    replacePhotoIdRef.current = null;
    if (!photoId || !fileList?.[0]) return;
    const file = fileList[0];
    if (replaceInputRef.current) replaceInputRef.current.value = "";

    const itemId = `replace-${Date.now()}-${file.name}`;
    setBusy(true);
    setUploads([
      {
        id: itemId,
        name: `Replace · ${file.name}`,
        totalBytes: file.size,
        loadedBytes: 0,
        status: "uploading",
      },
    ]);
    reportError(null);
    try {
      const photo = await replaceClientPhoto(photoId, file, (loaded, total) => {
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
      patchPhoto(photoId, photo);
      setUploads((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, loadedBytes: item.totalBytes, status: "done" } : item
        )
      );
    } catch (caught) {
      setUploads((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, status: "error" } : item))
      );
      reportError(caught instanceof Error ? caught.message : "Failed to replace photo.");
    } finally {
      setBusy(false);
      setUploads([]);
    }
  }

  const disabled = !clientId || !clientReady || busy;
  const canHardDelete = capabilities.canHardDelete;
  const sessionEmail = capabilities.email?.trim().toLowerCase() ?? "";

  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Photos & videos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Take a picture or pick from the gallery (JPG, HEIC, PNG, WebP, MP4, MOV) — works well on
            tablet. Images up to 15 MB; videos up to 50 MB.
            {!canHardDelete && (
              <>
                {" "}
                To remove media, request a delete — an admin confirms before it is removed.
              </>
            )}
          </p>
        </div>
        {photos.length > 0 && (
          <p className="text-sm font-medium text-slate-600">
            {photos.length} item{photos.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {canHardDelete && pendingDeletes.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
          <h3 className="text-sm font-semibold text-amber-950">
            Pending deletions ({pendingDeletes.length})
          </h3>
          <p className="mt-1 text-xs text-amber-800">
            Confirm to permanently delete, or Keep to reject the request.
          </p>
          <ul className="mt-3 space-y-2">
            {pendingDeletes.map((photo) => (
              <li
                key={`pending-${photo.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{photo.filename}</p>
                  <p className="truncate text-xs text-slate-500">
                    Requested by {photo.delete_requested_by ?? "unknown"}
                    {photo.delete_requested_at
                      ? ` · ${new Date(photo.delete_requested_at).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void postPhotoAction(photo.id, "keep")}
                  >
                    Keep
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={() => void postPhotoAction(photo.id, "confirm_delete")}
                  >
                    Confirm delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

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
            accept="image/*,image/heic,image/heif"
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
          <input
            ref={replaceInputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={disabled}
            onChange={(event) => void onReplaceFiles(event.target.files)}
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
          {photos.map((photo) => {
            const mediaUrl = `/api/sales/client-photos/${encodeURIComponent(photo.id)}?v=${encodeURIComponent(photo.uploaded_at)}`;
            const video = isVideoPhoto(photo);
            const pending = isDeletePending(photo);
            const canCancelOwnRequest =
              pending &&
              !canHardDelete &&
              Boolean(sessionEmail) &&
              photo.delete_requested_by?.trim().toLowerCase() === sessionEmail;

            return (
              <li
                key={photo.id}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
              >
                {pending && (
                  <span className="absolute left-2 top-2 z-10 rounded-md bg-amber-500 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white shadow">
                    Pending delete
                  </span>
                )}
                {video ? (
                  <video
                    key={mediaUrl}
                    src={mediaUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-square w-full bg-black object-contain"
                    aria-label={photo.filename}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={mediaUrl}
                    src={mediaUrl}
                    alt={photo.filename}
                    className="aspect-square w-full object-cover"
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-end gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    className="min-h-9 bg-white/95 text-slate-800 hover:bg-white"
                    onClick={() => startReplace(photo.id)}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Replace
                  </Button>
                  {canHardDelete ? (
                    pending ? (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          className="min-h-9 bg-white/95 text-slate-800 hover:bg-white"
                          onClick={() => void postPhotoAction(photo.id, "keep")}
                        >
                          Keep
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          className="min-h-9 bg-white/95 text-red-700 hover:bg-white"
                          onClick={() => void postPhotoAction(photo.id, "confirm_delete")}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Confirm
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        className="min-h-9 bg-white/95 text-red-700 hover:bg-white"
                        onClick={() => void deletePhoto(photo.id)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    )
                  ) : pending ? (
                    canCancelOwnRequest ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        className="min-h-9 bg-white/95 text-slate-800 hover:bg-white"
                        onClick={() => void postPhotoAction(photo.id, "cancel_request")}
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Cancel request
                      </Button>
                    ) : null
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      className="min-h-9 bg-white/95 text-amber-800 hover:bg-white"
                      onClick={() => void postPhotoAction(photo.id, "request_delete")}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Request delete
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        clientReady &&
        !loading &&
        uploads.length === 0 && (
          <p className="mt-4 text-center text-sm text-slate-500">
            No media yet — tap Take photo or Add from gallery.
          </p>
        )
      )}
    </section>
  );
}
