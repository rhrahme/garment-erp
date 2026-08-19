"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Factory, ImagePlus, Layers, Loader2, Package, Plus, Store, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { PageHeader, StatCard } from "@/components/ui/PageHeader";
import { readyMadeGarmentId } from "@/lib/ready-made/catalog-keys";
import { formatStageSummary, type ReadyMadeOverview } from "@/lib/ready-made/summary-types";
import type {
  ReadyMadeCatalogFile,
  ReadyMadeCatalogGarment,
  ReadyMadeCatalogImage,
} from "@/lib/types/ready-made-catalog";
import { cn } from "@/lib/utils";

async function uploadCatalogImage(
  garmentId: string,
  file: File,
  size: string | null
): Promise<{ ok: true; garment: ReadyMadeCatalogGarment } | { ok: false; error: string }> {
  try {
    const prepareResponse = await fetch("/api/ready-made/catalog/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        garment_id: garmentId,
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
      }),
    });
    const prepared = (await prepareResponse.json().catch(() => ({}))) as {
      mode?: string;
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
      const registerResponse = await fetch("/api/ready-made/catalog/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garment_id: garmentId,
          size,
          image_id: prepared.image_id,
          stored_filename: prepared.stored_filename,
          filename: file.name,
          content_type: prepared.content_type ?? file.type,
        }),
      });
      const registered = (await registerResponse.json().catch(() => ({}))) as {
        garment?: ReadyMadeCatalogGarment;
        error?: string;
      };
      if (!registerResponse.ok || !registered.garment) {
        return { ok: false, error: registered.error ?? "Could not register the upload." };
      }
      return { ok: true, garment: registered.garment };
    }

    const form = new FormData();
    form.set("garment_id", garmentId);
    if (size) form.set("size", size);
    form.set("file", file);
    const response = await fetch("/api/ready-made/catalog/upload", { method: "POST", body: form });
    const payload = (await response.json().catch(() => ({}))) as {
      garment?: ReadyMadeCatalogGarment;
      error?: string;
    };
    if (!response.ok || !payload.garment) {
      return { ok: false, error: payload.error ?? "Upload failed." };
    }
    return { ok: true, garment: payload.garment };
  } catch {
    return { ok: false, error: "Network error during upload. Try again." };
  }
}

function imageSrc(garmentId: string, image: ReadyMadeCatalogImage): string {
  return `/api/ready-made/catalog/${encodeURIComponent(garmentId)}/images/${encodeURIComponent(image.id)}?v=${encodeURIComponent(image.uploaded_at)}`;
}

function PhotoGrid({
  garmentId,
  images,
  busy,
  onDelete,
}: {
  garmentId: string;
  images: ReadyMadeCatalogImage[];
  busy: boolean;
  onDelete: (imageId: string) => void;
}) {
  if (images.length === 0) {
    return <p className="text-xs text-slate-400">No photos yet.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {images.map((image) => (
        <div key={image.id} className="group relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc(garmentId, image)}
            alt={image.filename}
            className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(image.id)}
            className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-red-600 p-0.5 text-white group-hover:block disabled:opacity-50"
            title="Delete photo"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function UploadButton({
  label,
  busy,
  onPick,
}: {
  label: string;
  busy: boolean;
  onPick: (files: FileList | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          onPick(event.target.files);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
        {label}
      </button>
    </>
  );
}

export function ReadyMadeWorkspace({ overview }: { overview: ReadyMadeOverview }) {
  const [catalog, setCatalog] = useState<ReadyMadeCatalogFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [customSize, setCustomSize] = useState("");

  const garmentsById = useMemo(() => {
    const map = new Map<string, ReadyMadeCatalogGarment>();
    for (const row of catalog?.garments ?? []) map.set(row.id, row);
    return map;
  }, [catalog]);

  const upsertGarment = useCallback((garment: ReadyMadeCatalogGarment) => {
    setCatalog((current) => {
      const garments = [...(current?.garments ?? [])];
      const index = garments.findIndex((row) => row.id === garment.id);
      if (index >= 0) garments[index] = garment;
      else garments.push(garment);
      return { updated_at: garment.updated_at, garments };
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/ready-made/catalog", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as ReadyMadeCatalogFile & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Failed to load photos.");
      setCatalog(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photos.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function ensureGarment(
    brandId: string,
    brandLabel: string,
    article: string,
    garmentType: string
  ): Promise<ReadyMadeCatalogGarment | null> {
    const id = readyMadeGarmentId(brandId, article, garmentType);
    const existing = garmentsById.get(id);
    if (existing) return existing;
    setBusyKey(id);
    try {
      const response = await fetch("/api/ready-made/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: brandId,
          brand_label: brandLabel,
          article,
          garment_type: garmentType,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        garment?: ReadyMadeCatalogGarment;
        error?: string;
      };
      if (!response.ok || !payload.garment) {
        setError(payload.error ?? "Could not open garment photos.");
        return null;
      }
      upsertGarment(payload.garment);
      return payload.garment;
    } finally {
      setBusyKey(null);
    }
  }

  async function handleFiles(
    brandId: string,
    brandLabel: string,
    article: string,
    garmentType: string,
    size: string | null,
    files: FileList | null
  ) {
    if (!files?.length) return;
    const garment = await ensureGarment(brandId, brandLabel, article, garmentType);
    if (!garment) return;
    setBusyKey(`${garment.id}:${size ?? "garment"}`);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const result = await uploadCatalogImage(garment.id, file, size);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        upsertGarment(result.garment);
      }
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteImage(garmentId: string, imageId: string) {
    setBusyKey(`${garmentId}:${imageId}`);
    try {
      const response = await fetch(
        `/api/ready-made/catalog/${encodeURIComponent(garmentId)}/images/${encodeURIComponent(imageId)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        garment?: ReadyMadeCatalogGarment;
        error?: string;
      };
      if (!response.ok || !payload.garment) {
        setError(payload.error ?? "Could not delete photo.");
        return;
      }
      upsertGarment(payload.garment);
    } finally {
      setBusyKey(null);
    }
  }

  async function addSize(garmentId: string) {
    const size = customSize.trim();
    if (!size) return;
    setBusyKey(`${garmentId}:add-size`);
    try {
      const response = await fetch("/api/ready-made/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ garment_id: garmentId, size }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        garment?: ReadyMadeCatalogGarment;
        error?: string;
      };
      if (!response.ok || !payload.garment) {
        setError(payload.error ?? "Could not add size.");
        return;
      }
      upsertGarment(payload.garment);
      setCustomSize("");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Ready-Made"
        description="Retail brand production - tracked by garment article, not as person clients."
      />

      <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 text-sm text-violet-950">
        <p className="font-medium">How this works</p>
        <p className="mt-1 text-violet-900">
          Each row is one garment article (e.g. Linen Short, Regular Shirt). Open Photos to upload
          style shots for the garment and a photo for each size (XS-XXL, plus any extra size you
          add).
        </p>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Retail brands"
          value={overview.brandCount}
          subtext="Massimo Dutti - Suit Supply - Boggi - Cafe Cotton - Zegna - Blue Mint - Lebanon Beirut - Luca Faloni"
          icon={<Store className="h-5 w-5" />}
          accent="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Articles"
          value={overview.articleCount}
          subtext={`${overview.orderCount} production orders`}
          icon={<Layers className="h-5 w-5" />}
          accent="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="Pieces in pipeline"
          value={overview.activePieces}
          subtext={`${overview.pieceCount} total pieces`}
          icon={<Factory className="h-5 w-5" />}
          accent="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Completed"
          value={overview.completedPieces}
          subtext="Marked done on production floor"
          icon={<Package className="h-5 w-5" />}
          accent="bg-emerald-50 text-emerald-600"
        />
      </div>

      <div className="space-y-8">
        {overview.brands.map((brand) => (
          <section key={brand.id} className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-slate-900">{brand.label}</h2>
                  <Badge className="bg-violet-100 text-violet-800">{brand.code}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {brand.articleCount} article{brand.articleCount !== 1 ? "s" : ""} - {brand.pieceCount}{" "}
                  pieces - {brand.activePieces} active
                </p>
              </div>
            </div>

            {brand.articles.length === 0 ? (
              <p className="text-sm text-slate-400">No production imported for this brand yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-semibold">Article</th>
                      <th className="px-3 py-2 font-semibold">Garment types</th>
                      <th className="px-3 py-2 font-semibold">Fabrics</th>
                      <th className="px-3 py-2 font-semibold">Pieces</th>
                      <th className="px-3 py-2 font-semibold">Pipeline</th>
                      <th className="px-3 py-2 font-semibold">Order</th>
                      <th className="px-3 py-2 font-semibold">Photos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {brand.articles.map((article) => {
                      const rowKey = `${brand.id}::${article.orderId}`;
                      const open = openKey === rowKey;
                      const garmentTypes =
                        article.garmentTypes.length > 0
                          ? article.garmentTypes
                          : [article.productArticle];
                      return (
                        <Fragment key={rowKey}>
                          <tr className="text-slate-800">
                            <td className="px-3 py-3 font-medium text-slate-900">
                              {article.productArticle}
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              {article.garmentTypes.join(", ") || "-"}
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              {article.fabricLineCount} line
                              {article.fabricLineCount !== 1 ? "s" : ""}
                            </td>
                            <td className="px-3 py-3">
                              <p className="font-medium text-slate-900">{article.pieceCount}</p>
                              <p className="text-xs text-slate-400">
                                {article.activePieces} active - {article.completedPieces} done
                              </p>
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-600">
                              {formatStageSummary(article.stageCounts) || "-"}
                            </td>
                            <td className="px-3 py-3">
                              <Link
                                href={`/orders/${article.orderId}`}
                                className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                              >
                                {article.soNumber} ?
                              </Link>
                            </td>
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenKey(open ? null : rowKey);
                                  if (!open) {
                                    for (const garmentType of garmentTypes) {
                                      void ensureGarment(
                                        brand.id,
                                        brand.label,
                                        article.productArticle,
                                        garmentType
                                      );
                                    }
                                  }
                                }}
                                className={cn(
                                  "rounded-lg px-2.5 py-1 text-xs font-semibold",
                                  open
                                    ? "bg-violet-100 text-violet-800"
                                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                )}
                              >
                                {open ? "Hide photos" : "Photos"}
                              </button>
                            </td>
                          </tr>
                          {open ? (
                            <tr key={`${rowKey}-photos`}>
                              <td colSpan={7} className="bg-slate-50 px-3 py-4">
                                <div className="space-y-5">
                                  {garmentTypes.map((garmentType) => {
                                    const garmentId = readyMadeGarmentId(
                                      brand.id,
                                      article.productArticle,
                                      garmentType
                                    );
                                    const garment = garmentsById.get(garmentId);
                                    return (
                                      <div
                                        key={garmentId}
                                        className="rounded-xl border border-slate-200 bg-white p-4"
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <p className="text-sm font-semibold text-slate-900">
                                            {garmentType}
                                            <span className="ml-2 text-xs font-normal text-slate-500">
                                              {article.productArticle}
                                            </span>
                                          </p>
                                          <UploadButton
                                            label="Upload garment photos"
                                            busy={busyKey === `${garmentId}:garment`}
                                            onPick={(files) =>
                                              void handleFiles(
                                                brand.id,
                                                brand.label,
                                                article.productArticle,
                                                garmentType,
                                                null,
                                                files
                                              )
                                            }
                                          />
                                        </div>
                                        <div className="mt-2">
                                          <PhotoGrid
                                            garmentId={garmentId}
                                            images={garment?.images ?? []}
                                            busy={Boolean(busyKey)}
                                            onDelete={(imageId) =>
                                              void deleteImage(garmentId, imageId)
                                            }
                                          />
                                        </div>

                                        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          Sizes
                                        </p>
                                        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                          {(garment?.sizes ?? []).map((slot) => (
                                            <div
                                              key={slot.size}
                                              className="rounded-lg border border-slate-200 p-3"
                                            >
                                              <div className="mb-2 flex items-center justify-between gap-2">
                                                <p className="text-sm font-semibold text-slate-800">
                                                  {slot.size}
                                                </p>
                                                <UploadButton
                                                  label="Upload"
                                                  busy={busyKey === `${garmentId}:${slot.size}`}
                                                  onPick={(files) =>
                                                    void handleFiles(
                                                      brand.id,
                                                      brand.label,
                                                      article.productArticle,
                                                      garmentType,
                                                      slot.size,
                                                      files
                                                    )
                                                  }
                                                />
                                              </div>
                                              <PhotoGrid
                                                garmentId={garmentId}
                                                images={slot.images}
                                                busy={Boolean(busyKey)}
                                                onDelete={(imageId) =>
                                                  void deleteImage(garmentId, imageId)
                                                }
                                              />
                                            </div>
                                          ))}
                                        </div>
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                          <input
                                            value={open ? customSize : ""}
                                            onChange={(event) => setCustomSize(event.target.value)}
                                            placeholder="Add size (e.g. 50)"
                                            className="w-40 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                                          />
                                          <button
                                            type="button"
                                            disabled={!garment || busyKey === `${garmentId}:add-size`}
                                            onClick={() => garment && void addSize(garment.id)}
                                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                          >
                                            <Plus className="h-3.5 w-3.5" />
                                            Add size
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
